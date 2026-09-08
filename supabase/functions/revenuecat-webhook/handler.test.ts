import { assertEquals } from 'jsr:@std/assert@1';

import { handleRevenueCatWebhook } from './handler.ts';
import type { ApplyEntitlementInput, LedgerEntry, RevenueCatMirror } from './mirror.ts';

const SECRET = 'test-webhook-secret';
const USER = '11111111-1111-1111-1111-111111111111';

interface Recorder extends RevenueCatMirror {
  applies: ApplyEntitlementInput[];
  ledger: LedgerEntry[];
}

/**
 * Stands in for the database. `stale` makes the RPC report "an newer event
 * already won", which is how the real ordering guard signals a no-op.
 */
function recorder(options: { stale?: boolean; failApply?: boolean } = {}): Recorder {
  const applies: ApplyEntitlementInput[] = [];
  const ledger: LedgerEntry[] = [];
  return {
    applies,
    ledger,
    applyEntitlement(input) {
      if (options.failApply) return Promise.reject(new Error('db down'));
      applies.push(input);
      return Promise.resolve(!options.stale);
    },
    recordEvent(entry) {
      ledger.push(entry);
      return Promise.resolve();
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
  const response = await handleRevenueCatWebhook(
    new Request('https://example.test/revenuecat-webhook'),
    { mirror: recorder(), readSecret: () => SECRET },
  );
  assertEquals(response.status, 405);
});

Deno.test('reports 503 when the secret is not configured', async () => {
  // Must not be 403: an unconfigured server should have RevenueCat retry once
  // the secret exists, rather than silently discarding real purchases.
  const response = await handleRevenueCatWebhook(post(event()), {
    mirror: recorder(),
    readSecret: () => undefined,
  });
  assertEquals(response.status, 503);
});

Deno.test('rejects a wrong secret', async () => {
  const response = await handleRevenueCatWebhook(post(event(), 'not-the-secret'), {
    mirror: recorder(),
    readSecret: () => SECRET,
  });
  assertEquals(response.status, 403);
});

Deno.test('rejects a missing Authorization header', async () => {
  const response = await handleRevenueCatWebhook(post(event(), null), {
    mirror: recorder(),
    readSecret: () => SECRET,
  });
  assertEquals(response.status, 403);
});

Deno.test('rejects a malformed body without asking for redelivery', async () => {
  const request = new Request('https://example.test/revenuecat-webhook', {
    method: 'POST',
    headers: { Authorization: SECRET, 'Content-Type': 'application/json' },
    body: '{"nope":true}',
  });
  const response = await handleRevenueCatWebhook(request, {
    mirror: recorder(),
    readSecret: () => SECRET,
  });
  assertEquals(response.status, 400);
});

Deno.test('activates the entitlement on an initial purchase', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(post(event()), {
    mirror,
    readSecret: () => SECRET,
  });

  assertEquals(response.status, 200);
  assertEquals(mirror.applies.length, 1);
  assertEquals(mirror.applies[0]?.userId, USER);
  assertEquals(mirror.applies[0]?.entitlement, 'pro');
  assertEquals(mirror.applies[0]?.status, 'active');
  assertEquals(mirror.applies[0]?.expiresAt, new Date(1_790_000_000_000).toISOString());
  assertEquals(mirror.ledger[0]?.applied, true);
});

Deno.test('cancellation keeps the entitlement active until it expires', async () => {
  // The case Sprint 6 calls "cancelled but active-until-expiry". Marking the
  // row expired here would revoke time the user has already paid for.
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ id: 'evt_cancel', type: 'CANCELLATION' })), {
    mirror,
    readSecret: () => SECRET,
  });

  assertEquals(mirror.applies[0]?.status, 'active');
  assertEquals(mirror.applies[0]?.expiresAt, new Date(1_790_000_000_000).toISOString());
});

Deno.test('a billing issue does not revoke access', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ id: 'evt_billing', type: 'BILLING_ISSUE' })), {
    mirror,
    readSecret: () => SECRET,
  });

  assertEquals(mirror.applies[0]?.status, 'active');
});

Deno.test('expiration revokes the entitlement', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ id: 'evt_exp', type: 'EXPIRATION' })), {
    mirror,
    readSecret: () => SECRET,
  });

  assertEquals(mirror.applies[0]?.status, 'expired');
});

Deno.test('a stale event is acknowledged but changes nothing', async () => {
  const mirror = recorder({ stale: true });
  const response = await handleRevenueCatWebhook(post(event({ id: 'evt_old' })), {
    mirror,
    readSecret: () => SECRET,
  });

  assertEquals(response.status, 200);
  assertEquals(mirror.ledger[0]?.applied, false);
  assertEquals(mirror.ledger[0]?.skippedReason, 'STALE_EVENT');
});

Deno.test('ignores an anonymous app_user_id without writing the mirror', async () => {
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(
    post(event({ id: 'evt_anon', app_user_id: '$RCAnonymousID:abc123' })),
    { mirror, readSecret: () => SECRET },
  );

  assertEquals(response.status, 200);
  assertEquals(mirror.applies.length, 0);
  assertEquals(mirror.ledger[0]?.skippedReason, 'ANONYMOUS_APP_USER_ID');
});

Deno.test('ignores an app_user_id that is not a Supabase user id', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ id: 'evt_bad', app_user_id: 'legacy-42' })), {
    mirror,
    readSecret: () => SECRET,
  });

  assertEquals(mirror.applies.length, 0);
  assertEquals(mirror.ledger[0]?.skippedReason, 'APP_USER_ID_NOT_A_USER');
});

Deno.test('ignores an unrecognised event type instead of failing', async () => {
  // A new RevenueCat event type must not become an outage.
  const mirror = recorder();
  const response = await handleRevenueCatWebhook(
    post(event({ id: 'evt_new', type: 'SOMETHING_ADDED_LATER' })),
    { mirror, readSecret: () => SECRET },
  );

  assertEquals(response.status, 200);
  assertEquals(mirror.applies.length, 0);
  assertEquals(mirror.ledger[0]?.skippedReason, 'UNHANDLED_EVENT_TYPE');
});

Deno.test('ignores a test event', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(post(event({ id: 'evt_test', type: 'TEST' })), {
    mirror,
    readSecret: () => SECRET,
  });

  assertEquals(mirror.applies.length, 0);
  assertEquals(mirror.ledger[0]?.skippedReason, 'TEST_EVENT');
});

Deno.test('a lifetime purchase has no expiry', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(
    post(event({ id: 'evt_life', type: 'NON_RENEWING_PURCHASE', expiration_at_ms: null })),
    { mirror, readSecret: () => SECRET },
  );

  assertEquals(mirror.applies[0]?.expiresAt, null);
});

Deno.test('a transfer moves the entitlement off the previous owner', async () => {
  const previous = '22222222-2222-2222-2222-222222222222';
  const mirror = recorder();
  await handleRevenueCatWebhook(
    post(event({ id: 'evt_xfer', type: 'TRANSFER', transferred_from: [previous] })),
    { mirror, readSecret: () => SECRET },
  );

  assertEquals(mirror.applies.length, 2);
  assertEquals(mirror.applies[0]?.userId, USER);
  assertEquals(mirror.applies[0]?.status, 'active');
  assertEquals(mirror.applies[1]?.userId, previous);
  assertEquals(mirror.applies[1]?.status, 'expired');
});

Deno.test('writes every entitlement carried by one event', async () => {
  const mirror = recorder();
  await handleRevenueCatWebhook(
    post(event({ id: 'evt_multi', entitlement_ids: ['pro', 'beta'] })),
    { mirror, readSecret: () => SECRET },
  );

  assertEquals(
    mirror.applies.map((a) => a.entitlement),
    ['pro', 'beta'],
  );
});

Deno.test('asks for redelivery when the database is unavailable', async () => {
  const response = await handleRevenueCatWebhook(post(event({ id: 'evt_down' })), {
    mirror: recorder({ failApply: true }),
    readSecret: () => SECRET,
  });

  assertEquals(response.status, 500);
});
