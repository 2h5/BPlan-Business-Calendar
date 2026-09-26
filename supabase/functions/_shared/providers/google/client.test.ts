// deno-lint-ignore-file require-await -- async stubs implement Promise-returning dependency interfaces.
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { EdgeError } from '../../errors/index.ts';

import { createGoogleClient, type GoogleRequestOperation } from './client.ts';

const NOW = Date.parse('2026-01-01T00:00:00.000Z');

Deno.test('maps Google status codes and keeps cursor invalidation operation-specific', async () => {
  const cases: Array<{
    status: number;
    operation: GoogleRequestOperation;
    code: string;
    edgeStatus: number;
  }> = [
    { status: 401, operation: 'event', code: 'PROVIDER_AUTH_EXPIRED', edgeStatus: 401 },
    { status: 403, operation: 'event', code: 'NOT_AUTHORIZED', edgeStatus: 403 },
    { status: 404, operation: 'event', code: 'NOT_FOUND', edgeStatus: 404 },
    { status: 409, operation: 'event', code: 'EVENT_PROVIDER_CONFLICT', edgeStatus: 409 },
    { status: 412, operation: 'event', code: 'EVENT_PROVIDER_CONFLICT', edgeStatus: 409 },
    {
      status: 410,
      operation: 'sync',
      code: 'PROVIDER_SYNC_CURSOR_INVALID',
      edgeStatus: 410,
    },
    { status: 410, operation: 'watch', code: 'UNKNOWN', edgeStatus: 502 },
  ];

  for (const testCase of cases) {
    const googleFetch = createGoogleClient({
      fetch: async () => new Response(null, { status: testCase.status }),
    });

    await expectEdgeError(
      () =>
        googleFetch({
          accessToken: 'dummy-access-token',
          url: 'https://www.googleapis.com/calendar/v3/test',
          operation: testCase.operation,
        }),
      testCase.code,
      testCase.edgeStatus,
    );
  }
});

Deno.test('retries replay-safe requests with injected time and HTTP-date backoff', async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const retryAt = new Date(NOW + 3500).toUTCString();
  const googleFetch = createGoogleClient({
    now: () => NOW,
    random: () => 0,
    sleep: (milliseconds) => {
      sleeps.push(milliseconds);
      return Promise.resolve();
    },
    fetch: async () => {
      calls += 1;
      if (calls === 1) return responseWithHeaders(429, { 'Retry-After': retryAt });
      if (calls === 2) return responseWithHeaders(500);
      return jsonResponse({ items: [] });
    },
  });

  assertEquals(
    await googleFetch({
      accessToken: 'dummy-access-token',
      url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      operation: 'calendar',
    }),
    { items: [] },
  );
  assertEquals(calls, 3);
  assertEquals(sleeps, [3000, 500]);
});

Deno.test('does not retry unsafe writes or transport failures without replay safety', async () => {
  for (const testCase of [
    { failure: () => Promise.resolve(responseWithHeaders(503)), code: 'UNKNOWN' },
    {
      failure: () => Promise.reject(new Error('private transport detail')),
      code: 'NETWORK_UNAVAILABLE',
    },
  ]) {
    let calls = 0;
    const sleeps: number[] = [];
    const googleFetch = createGoogleClient({
      fetch: () => {
        calls += 1;
        return testCase.failure();
      },
      sleep: (milliseconds) => {
        sleeps.push(milliseconds);
        return Promise.resolve();
      },
    });

    const error = await expectEdgeError(
      () =>
        googleFetch({
          accessToken: 'dummy-access-token',
          method: 'POST',
          url: 'https://www.googleapis.com/calendar/v3/calendars/work/events',
          body: { summary: 'Do not duplicate' },
          operation: 'event',
        }),
      testCase.code,
      testCase.code === 'NETWORK_UNAVAILABLE' ? 503 : 502,
    );
    assertEquals(error.code, testCase.code);
    assertEquals(calls, 1);
    assertEquals(sleeps, []);
  }
});

Deno.test('rejects malformed successful JSON without exposing provider text', async () => {
  const googleFetch = createGoogleClient({
    fetch: async () => new Response('private provider body', { status: 200 }),
  });

  const error = await expectEdgeError(
    () =>
      googleFetch({
        accessToken: 'dummy-access-token',
        url: 'https://www.googleapis.com/calendar/v3/test',
        operation: 'calendar',
      }),
    'UNKNOWN',
    502,
  );
  assertEquals(error.message.includes('private provider body'), false);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function responseWithHeaders(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

async function expectEdgeError(
  operation: () => Promise<unknown>,
  code: string | undefined,
  status: number,
): Promise<EdgeError> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  if (!(caught instanceof EdgeError)) {
    throw new Error(`Expected EdgeError, got ${String(caught)}.`);
  }
  if (code !== undefined) assertEquals(caught.code, code);
  assertEquals(caught.status, status);
  return caught;
}
