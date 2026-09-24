import { assertEquals } from 'jsr:@std/assert@1';

import {
  dashboardTest,
  initialPurchase,
  OTHER_USER,
  refundCancellation,
  transfer,
  USER,
  type Body,
} from './fixtures.ts';
import { handleRevenueCatWebhook, type RevenueCatWebhookConfig } from './handler.ts';
import type { EventOutcome, ProcessEventInput, RevenueCatMirror } from './mirror.ts';
import { hmacSha256Hex, SIGNATURE_HEADER } from './signature.ts';

const SECRET = 'test-webhook-secret';
const SIGNING_SECRET = 'test-signing-secret';
const NOW_SECONDS = 1_760_000_100;

interface Recorder extends RevenueCatMirror {
  calls: ProcessEventInput[];
  failures: string[][];
}

function recorder(
  options: { result?: EventOutcome; fail?: boolean; failureFails?: boolean } = {},
): Recorder {
  const calls: ProcessEventInput[] = [];
  const failures: string[][] = [];
  return {
    calls,
    failures,
    recordFailure(userIds) {
      if (options.failureFails) return Promise.reject(new Error('db down'));
      failures.push(userIds);
      return Promise.resolve(userIds.length);
    },
    processEvent(input) {
      if (options.fail) return Promise.reject(new Error('db down'));
      calls.push(input);
      const fallback: EventOutcome =
        input.decision === 'ignore'
          ? 'IGNORED'
          : input.decision === 'reconcile'
            ? 'DEFERRED'
            : 'APPLIED';
      return Promise.resolve(options.result ?? fallback);
    },
  };
}

function config(overrides: Partial<RevenueCatWebhookConfig> = {}): () => RevenueCatWebhookConfig {
  return () => ({ secret: SECRET, environment: 'SANDBOX', signingSecret: undefined, ...overrides });
}

function post(body: Body | string, headers: Record<string, string | null> = {}): Request {
  const all = new Headers({ 'Content-Type': 'application/json' });
  const authorization = headers.Authorization === undefined ? SECRET : headers.Authorization;
  if (authorization !== null) all.set('Authorization', authorization);
  for (const [name, value] of Object.entries(headers)) {
    if (name !== 'Authorization' && value !== null) all.set(name, value);
  }
  return new Request('https://example.test/revenuecat-webhook', {
    method: 'POST',
    headers: all,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function run(request: Request, mirror: RevenueCatMirror, overrides = {}) {
  return await handleRevenueCatWebhook(request, {
    mirror,
    readConfig: config(overrides),
    nowSeconds: () => NOW_SECONDS,
  });
}

Deno.test('rejects a non-POST request', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(
    new Request('https://example.test/revenuecat-webhook', { method: 'GET' }),
    { mirror, readConfig: config() },
  );
  assertEquals(response.status, 405);
  assertEquals(mirror.calls.length, 0);
});

Deno.test('reports 503 until both the secret and the environment are configured', async () => {
  for (const overrides of [
    { secret: undefined },
    { environment: undefined },
    { environment: 'prod' },
  ]) {
    const mirror = recorder();
    const response = await run(post(initialPurchase()), mirror, overrides);
    assertEquals(response.status, 503);
    assertEquals(mirror.calls.length, 0);
  }
});

Deno.test('rejects a wrong or missing Authorization header', async () => {
  for (const Authorization of ['not-the-secret', null]) {
    const mirror = recorder();
    const response = await run(post(initialPurchase(), { Authorization }), mirror);
    assertEquals(response.status, 403);
    assertEquals(mirror.calls.length, 0);
  }
});

Deno.test('an envelope without an event ID cannot be recorded and is refused', async () => {
  for (const body of ['not json', JSON.stringify({ event: { type: 'RENEWAL' } })]) {
    const mirror = recorder();
    const response = await run(post(body), mirror);
    assertEquals(response.status, 400);
    assertEquals(mirror.calls.length, 0);
  }
});

Deno.test('an oversized body is refused before parsing', async () => {
  const mirror = recorder();
  const response = await run(post('x'.repeat(300 * 1024)), mirror);
  assertEquals(response.status, 400);
  assertEquals(mirror.calls.length, 0);
});

Deno.test('a documented TRANSFER is accepted and deferred, not rejected as malformed', async () => {
  const mirror = recorder();
  const response = await run(post(transfer()), mirror);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { result: 'DEFERRED' });
  assertEquals(mirror.calls[0]?.decision, 'reconcile');
  assertEquals(mirror.calls[0]?.reconcileUserIds, [USER, OTHER_USER]);
  assertEquals(mirror.calls[0]?.userId, USER);
  assertEquals(mirror.calls[0]?.entitlements, []);
  assertEquals(mirror.calls[0]?.environment, 'SANDBOX');
});

Deno.test('one valid purchase is one atomic database call with all event facts', async () => {
  const mirror = recorder();
  const response = await run(post(initialPurchase()), mirror);
  assertEquals(await response.json(), { result: 'APPLIED' });
  assertEquals(mirror.calls.length, 1);
  const call = mirror.calls[0];
  assertEquals(call?.eventId, 'evt-initial-purchase');
  assertEquals(call?.decision, 'apply');
  assertEquals(call?.userId, USER);
  assertEquals(call?.appUserId, USER);
  assertEquals(call?.status, 'active');
  assertEquals(call?.entitlements, ['pro']);
  assertEquals(call?.environment, 'SANDBOX');
  assertEquals(call?.skippedReason, null);
});

Deno.test('the ledger payload keeps the event but drops subscriber attributes', async () => {
  const mirror = recorder();
  await run(post(initialPurchase()), mirror);
  const payload = mirror.calls[0]?.payload as { event: Record<string, unknown> };
  assertEquals('subscriber_attributes' in payload.event, false);
  assertEquals(payload.event.product_id, 'bplan_pro_monthly');
  assertEquals(JSON.stringify(payload).includes('customer@example.com'), false);
});

Deno.test('a sandbox event is recorded and ignored by a production deployment', async () => {
  const mirror = recorder();
  const response = await run(post(initialPurchase()), mirror, { environment: 'PRODUCTION' });
  assertEquals(response.status, 200);
  assertEquals(mirror.calls[0]?.decision, 'ignore');
  assertEquals(mirror.calls[0]?.skippedReason, 'ENVIRONMENT_MISMATCH');
  assertEquals(mirror.calls[0]?.userId, null);
  assertEquals(mirror.calls[0]?.appUserId, USER);
});

Deno.test('database outcomes pass through without a second write', async () => {
  for (const result of ['STALE', 'DUPLICATE', 'IGNORED'] as const) {
    const mirror = recorder({ result });
    const response = await run(post(refundCancellation()), mirror);
    assertEquals(response.status, 200);
    assertEquals(await response.json(), { result });
    assertEquals(mirror.calls.length, 1);
  }
});

Deno.test('a dashboard TEST event is acknowledged and recorded as ignored', async () => {
  const mirror = recorder();
  const response = await run(post(dashboardTest()), mirror);
  assertEquals(response.status, 200);
  assertEquals(mirror.calls[0]?.skippedReason, 'TEST_EVENT');
});

Deno.test('asks for redelivery only when the database operation fails', async () => {
  const response = await run(post(initialPurchase()), recorder({ fail: true }));
  assertEquals(response.status, 500);
});

Deno.test('a failed delivery queues reconciliation for every user it named', async () => {
  const purchase = recorder({ fail: true });
  assertEquals((await run(post(initialPurchase()), purchase)).status, 500);
  assertEquals(purchase.failures, [[USER]]);

  const moved = recorder({ fail: true });
  assertEquals((await run(post(transfer()), moved)).status, 500);
  assertEquals(moved.failures, [[USER, OTHER_USER]]);

  const ignored = recorder({ fail: true });
  assertEquals((await run(post(dashboardTest()), ignored)).status, 500);
  assertEquals(ignored.failures, []);
});

Deno.test('a failure to queue after a failed delivery still asks for redelivery', async () => {
  const response = await run(post(initialPurchase()), recorder({ fail: true, failureFails: true }));
  assertEquals(response.status, 500);
});

Deno.test('a cancellation asks the database to reconcile its subject after applying', async () => {
  const mirror = recorder();
  await run(post(refundCancellation()), mirror);
  assertEquals(mirror.calls[0]?.decision, 'apply');
  assertEquals(mirror.calls[0]?.reconcileUserIds, [USER]);

  const purchase = recorder();
  await run(post(initialPurchase()), purchase);
  assertEquals(purchase.calls[0]?.reconcileUserIds, []);
});

async function signed(body: Body, timestamp = NOW_SECONDS, secret = SIGNING_SECRET) {
  const raw = JSON.stringify(body);
  const signature = await hmacSha256Hex(secret, `${timestamp}.${raw}`);
  return post(raw, { [SIGNATURE_HEADER]: `t=${timestamp},v1=${signature}` });
}

Deno.test('a configured signing secret accepts a fresh HMAC over the raw body', async () => {
  const mirror = recorder();
  const response = await run(await signed(initialPurchase()), mirror, {
    signingSecret: SIGNING_SECRET,
  });
  assertEquals(response.status, 200);
  assertEquals(mirror.calls.length, 1);
});

Deno.test(
  'a configured signing secret rejects missing, stale, forged, or altered signatures',
  async () => {
    const altered = await signed(initialPurchase());
    const tampered = new Request(altered.url, {
      method: 'POST',
      headers: altered.headers,
      body: JSON.stringify(initialPurchase({ entitlement_ids: ['pro', 'admin'] })),
    });
    for (const request of [
      post(initialPurchase()),
      await signed(initialPurchase(), NOW_SECONDS - 301),
      await signed(initialPurchase(), NOW_SECONDS, 'wrong-secret'),
      tampered,
      post(initialPurchase(), { [SIGNATURE_HEADER]: 'v1=deadbeef' }),
    ]) {
      const mirror = recorder();
      const response = await run(request, mirror, { signingSecret: SIGNING_SECRET });
      assertEquals(response.status, 403);
      assertEquals(mirror.calls.length, 0);
    }
  },
);
