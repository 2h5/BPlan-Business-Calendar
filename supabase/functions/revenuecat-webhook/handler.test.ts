import { assertEquals } from 'jsr:@std/assert@1';

import { handleRevenueCatWebhook } from './handler.ts';
import type { EventOutcome, ProcessEventInput, RevenueCatMirror } from './mirror.ts';

const SECRET = 'test-webhook-secret';
const USER = '11111111-1111-1111-1111-111111111111';

interface Recorder extends RevenueCatMirror {
  calls: ProcessEventInput[];
}

function recorder(options: { result?: EventOutcome; fail?: boolean } = {}): Recorder {
  const calls: ProcessEventInput[] = [];
  return {
    calls,
    processEvent(input) {
      if (options.fail) return Promise.reject(new Error('db down'));
      calls.push(input);
      return Promise.resolve(options.result ?? (input.skippedReason ? 'IGNORED' : 'APPLIED'));
    },
  };
}

function post(event: Record<string, unknown>, authorization: string | null = SECRET): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (authorization !== null) headers.set('Authorization', authorization);
  return new Request('https://example.test/revenuecat-webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify({ api_version: '1.0', event }),
  });
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'evt_1',
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    event_timestamp_ms: 1_760_000_000_000,
    expiration_at_ms: 1_790_000_000_000,
    entitlement_ids: ['pro'],
    environment: 'SANDBOX',
    ...overrides,
  };
}

Deno.test('rejects a non-POST request', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(
    new Request('https://example.test/revenuecat-webhook'),
    { mirror, readSecret: () => SECRET },
  );
  assertEquals(response.status, 405);
  assertEquals(mirror.calls.length, 0);
});

Deno.test('reports 503 when the secret is not configured', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(post(event()), {
    mirror,
    readSecret: () => undefined,
  });
  assertEquals(response.status, 503);
  assertEquals(mirror.calls.length, 0);
});

Deno.test('rejects a wrong secret', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(post(event(), 'not-the-secret'), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(response.status, 403);
  assertEquals(mirror.calls.length, 0);
});

Deno.test('rejects a missing Authorization header', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(post(event(), null), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(response.status, 403);
  assertEquals(mirror.calls.length, 0);
});

Deno.test('rejects a malformed body without asking for redelivery', async () => {
  const mirror = recorder();
  const request = new Request('https://example.test/revenuecat-webhook', {
    method: 'POST',
    headers: { Authorization: SECRET, 'Content-Type': 'application/json' },
    body: '{"nope":true}',
  });
  const response = await handleRevenueCatWebhook(request, {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(response.status, 400);
  assertEquals(mirror.calls.length, 0);
});

Deno.test('one valid delivery uses one atomic database call with all event facts', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(post(event()), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(await response.json(), { result: 'APPLIED' });
  assertEquals(mirror.calls.length, 1);
  assertEquals(mirror.calls[0]?.eventId, 'evt_1');
  assertEquals(mirror.calls[0]?.userId, USER);
  assertEquals(mirror.calls[0]?.status, 'active');
  assertEquals(mirror.calls[0]?.entitlements, ['pro']);
  assertEquals(mirror.calls[0]?.expiresAt, new Date(1_790_000_000_000).toISOString());
  assertEquals(mirror.calls[0]?.skippedReason, null);
});

Deno.test('returns the database stale outcome without a second write', async () => {
  const mirror = recorder({ result: 'STALE' });
  const response = await handleRevenueCatWebhook(post(event()), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(await response.json(), { result: 'STALE' });
  assertEquals(mirror.calls.length, 1);
});

Deno.test('acknowledges a duplicate after one atomic database call', async () => {
  const mirror = recorder({ result: 'DUPLICATE' });
  const response = await handleRevenueCatWebhook(post(event()), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(await response.json(), { result: 'DUPLICATE' });
  assertEquals(mirror.calls.length, 1);
});

Deno.test('cancellation keeps entitlement active until expiration', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ type: 'CANCELLATION' })), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(mirror.calls[0]?.status, 'active');
  assertEquals(mirror.calls[0]?.expiresAt, new Date(1_790_000_000_000).toISOString());
});

Deno.test('billing issue keeps entitlement active', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ type: 'BILLING_ISSUE' })), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(mirror.calls[0]?.status, 'active');
});

Deno.test('expiration revokes entitlement', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ type: 'EXPIRATION' })), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(mirror.calls[0]?.status, 'expired');
});

for (const [name, overrides, reason] of [
  [
    'anonymous user',
    { id: 'evt_anon', app_user_id: '$RCAnonymousID:abc123' },
    'ANONYMOUS_APP_USER_ID',
  ],
  ['invalid user ID', { id: 'evt_bad', app_user_id: 'legacy-42' }, 'APP_USER_ID_NOT_A_USER'],
  ['unknown type', { id: 'evt_new', type: 'SOMETHING_ADDED_LATER' }, 'UNHANDLED_EVENT_TYPE'],
  ['test event', { id: 'evt_test', type: 'TEST' }, 'TEST_EVENT'],
] as const) {
  Deno.test(`records ${name} as ignored through one database call`, async () => {
    const mirror = recorder();
    const response = await handleRevenueCatWebhook(post(event(overrides)), {
      mirror,
      readSecret: () => SECRET,
    });
    assertEquals(await response.json(), { result: 'IGNORED' });
    assertEquals(mirror.calls.length, 1);
    assertEquals(mirror.calls[0]?.userId, null);
    assertEquals(mirror.calls[0]?.entitlements, []);
    assertEquals(mirror.calls[0]?.skippedReason, reason);
  });
}

Deno.test('a lifetime purchase has no expiry', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(
    post(event({ type: 'NON_RENEWING_PURCHASE', expiration_at_ms: null })),
    {
      mirror,
      readSecret: () => SECRET,
    },
  );
  assertEquals(mirror.calls[0]?.expiresAt, null);
});

Deno.test('a transfer passes both owners to one atomic operation', async () => {
  const previous = '22222222-2222-2222-2222-222222222222';
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ type: 'TRANSFER', transferred_from: [previous] })), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(mirror.calls.length, 1);
  assertEquals(mirror.calls[0]?.userId, USER);
  assertEquals(mirror.calls[0]?.revokeFrom, [previous]);
  assertEquals(mirror.calls[0]?.entitlements, ['pro']);
});

Deno.test('passes every entitlement in one atomic call', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ entitlement_ids: ['pro', 'beta'] })), {
    mirror,
    readSecret: () => SECRET,
  });
  assertEquals(mirror.calls.length, 1);
  assertEquals(mirror.calls[0]?.entitlements, ['pro', 'beta']);
});

Deno.test('asks for redelivery when the atomic database operation fails', async () => {
  const response = await handleRevenueCatWebhook(post(event()), {
    mirror: recorder({ fail: true }),
    readSecret: () => SECRET,
  });
  assertEquals(response.status, 500);
});
