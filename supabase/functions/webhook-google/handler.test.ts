// deno-lint-ignore-file require-await -- async stubs implement Promise-returning dependency interfaces.
import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  handleGoogleWebhook,
  type GoogleWebhookAccount,
  type GoogleWebhookState,
} from './handler.ts';

const state: GoogleWebhookState = {
  id: '11111111-1111-1111-1111-111111111111',
  calendar_id: '22222222-2222-2222-2222-222222222222',
  provider_account_id: '33333333-3333-3333-3333-333333333333',
  webhook_token: 'channel-token',
  webhook_resource_id: 'resource-1',
};
const account: GoogleWebhookAccount = { user_id: '44444444-4444-4444-4444-444444444444' };
const fixedNow = new Date('2026-01-01T00:00:00.000Z');

Deno.test('valid Google delivery queues one idempotent calendar sync on replay', async () => {
  const jobs: Array<Record<string, unknown>> = [];
  const seenKeys = new Set<string>();
  let backgroundCalls = 0;
  const deps = {
    lookupState: async () => state,
    lookupAccount: async () => account,
    enqueue: async (job: Record<string, unknown>) => {
      const key = String(job.idempotencyKey);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        jobs.push(job);
        return 'job-id';
      }
      return null;
    },
    afterResponse: async (work: () => Promise<void>) => {
      backgroundCalls += 1;
      await work();
    },
    now: () => fixedNow,
  };

  const first = await handleGoogleWebhook(deliveryRequest(), deps);
  const replay = await handleGoogleWebhook(deliveryRequest(), deps);

  assertEquals(first.status, 200);
  assertEquals(replay.status, 200);
  assertEquals(jobs.length, 1);
  assertEquals(jobs[0]?.kind, 'calendar.sync');
  assertEquals(jobs[0]?.providerAccountId, state.provider_account_id);
  assertEquals(jobs[0]?.payload, { calendarId: state.calendar_id });
  assertEquals(backgroundCalls, 2);
});

Deno.test('forged or incomplete Google proofs acknowledge without enqueueing', async () => {
  const jobs: Array<Record<string, unknown>> = [];
  const deps = {
    lookupState: async () => state,
    lookupAccount: async () => account,
    enqueue: async (job: Record<string, unknown>) => {
      jobs.push(job);
      return 'job-id';
    },
    afterResponse: async (_work: () => Promise<void>) => undefined,
    now: () => fixedNow,
  };

  for (const headers of [
    {
      'X-Goog-Channel-ID': state.id,
      'X-Goog-Channel-Token': 'wrong',
      'X-Goog-Resource-ID': 'resource-1',
    },
    {
      'X-Goog-Channel-ID': state.id,
      'X-Goog-Channel-Token': 'channel-toke',
      'X-Goog-Resource-ID': 'resource-1',
    },
    {
      'X-Goog-Channel-ID': state.id,
      'X-Goog-Channel-Token': 'channel-token',
      'X-Goog-Resource-ID': 'wrong',
    },
    {
      'X-Goog-Channel-ID': state.id,
      'X-Goog-Channel-Token': 'channel-token',
      'X-Goog-Resource-ID': undefined,
    },
  ]) {
    assertEquals((await handleGoogleWebhook(deliveryRequest(headers), deps)).status, 200);
  }
  assertEquals(
    (
      await handleGoogleWebhook(
        deliveryRequest({
          'X-Goog-Channel-ID': 'unknown',
          'X-Goog-Channel-Token': 'channel-token',
          'X-Goog-Resource-ID': 'resource-1',
        }),
        { ...deps, lookupState: async () => null },
      )
    ).status,
    200,
  );
  assertEquals(jobs.length, 0);
});

Deno.test('Google handshake and unsupported methods do not select work', async () => {
  let lookups = 0;
  const deps = {
    lookupState: async () => {
      lookups += 1;
      return state;
    },
    lookupAccount: async () => account,
    enqueue: async (_job: Record<string, unknown>) => 'job-id',
    afterResponse: async (_work: () => Promise<void>) => undefined,
    now: () => fixedNow,
  };

  assertEquals(
    (
      await handleGoogleWebhook(
        new Request('https://project.example.com/webhook-google', { method: 'GET' }),
        deps,
      )
    ).status,
    200,
  );
  assertEquals(
    (
      await handleGoogleWebhook(
        new Request('https://project.example.com/webhook-google', {
          method: 'POST',
          headers: { 'X-Goog-Resource-State': 'sync' },
        }),
        deps,
      )
    ).status,
    200,
  );
  assertEquals(
    (
      await handleGoogleWebhook(
        new Request('https://project.example.com/webhook-google', { method: 'PUT' }),
        deps,
      )
    ).status,
    405,
  );
  assertEquals(lookups, 0);
});

function deliveryRequest(overrides: Record<string, string | undefined> = {}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Goog-Channel-ID': 'channel-1',
    'X-Goog-Channel-Token': 'channel-token',
    'X-Goog-Resource-ID': 'resource-1',
    'X-Goog-Resource-State': 'exists',
  };
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete headers[name];
    else headers[name] = value;
  }

  return new Request('https://project.example.com/webhook-google', {
    method: 'POST',
    headers,
    body: 'not JSON, intentionally ignored',
  });
}
