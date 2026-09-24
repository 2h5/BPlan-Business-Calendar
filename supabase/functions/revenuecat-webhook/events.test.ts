import { assertEquals } from 'jsr:@std/assert@1';

import { revenueCatWebhookEnvelopeSchema } from '@cal/schemas/subscription';

import { decideEvent } from './events.ts';
import {
  ANONYMOUS,
  dashboardTest,
  expiration,
  initialPurchase,
  invoiceIssuance,
  OTHER_USER,
  purchaseRedeemed,
  refundCancellation,
  refundReversed,
  subscriptionPaused,
  temporaryEntitlementGrant,
  transfer,
  USER,
  type Body,
} from './fixtures.ts';

function decide(body: Body, environment: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX') {
  return decideEvent(revenueCatWebhookEnvelopeSchema.parse(body).event, environment);
}

Deno.test('a documented purchase applies active Pro with its period end', () => {
  const decision = decide(initialPurchase());
  assertEquals(decision.kind, 'apply');
  if (decision.kind !== 'apply') return;
  assertEquals(decision.userId, USER);
  assertEquals(decision.entitlements, ['pro']);
  assertEquals(decision.status, 'active');
  assertEquals(decision.environment, 'SANDBOX');
  assertEquals(decision.expiresAt, new Date(1_762_592_000_000).toISOString());
});

Deno.test('a refund applies its payload and is also reconciled from RevenueCat', () => {
  const decision = decide(refundCancellation());
  assertEquals(decision.kind, 'apply');
  if (decision.kind !== 'apply') return;
  assertEquals(decision.status, 'active');
  assertEquals(Date.parse(decision.expiresAt ?? '') < 1_760_000_000_000, true);
  // Access must not depend on what expiration_at_ms holds on a refund.
  assertEquals(decision.reconcile, true);
});

Deno.test('a cancellation that keeps its paid period is still confirmed from RevenueCat', () => {
  const decision = decide(
    initialPurchase({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE', id: 'evt-cancel' }),
  );
  assertEquals(decision.kind === 'apply' && decision.reconcile, true);
  const billing = decide(
    initialPurchase({ type: 'BILLING_ISSUE', grace_period_expiration_at_ms: null, id: 'evt-bill' }),
  );
  assertEquals(billing.kind === 'apply' && billing.reconcile, true);
});

Deno.test('self-describing lifecycle events apply without an extra RevenueCat read', () => {
  for (const body of [initialPurchase(), expiration(), subscriptionPaused(), refundReversed()]) {
    const decision = decide(body);
    assertEquals(decision.kind === 'apply' && decision.reconcile, false);
  }
});

Deno.test('a scheduled pause keeps access until the end of the paid period', () => {
  const decision = decide(subscriptionPaused());
  assertEquals(decision.kind, 'apply');
  if (decision.kind !== 'apply') return;
  assertEquals(decision.status, 'active');
  assertEquals(decision.expiresAt, new Date(1_762_592_000_000).toISOString());
});

Deno.test('expiration revokes and a reversed refund restores', () => {
  const expired = decide(expiration());
  assertEquals(expired.kind === 'apply' && expired.status, 'expired');
  const restored = decide(refundReversed());
  assertEquals(restored.kind === 'apply' && restored.status, 'active');
});

Deno.test('the documented TRANSFER payload defers to reconciliation for both owners', () => {
  const decision = decide(transfer());
  assertEquals(decision, {
    kind: 'reconcile',
    appUserId: USER,
    primaryUserId: USER,
    userIds: [USER, OTHER_USER],
  });
});

Deno.test('opposite transfers queue the same users in the same order', () => {
  const forward = decide(transfer([USER], [OTHER_USER]));
  const back = decide(transfer([OTHER_USER], [USER]));
  assertEquals(forward.kind === 'reconcile' && forward.userIds, [USER, OTHER_USER]);
  assertEquals(back.kind === 'reconcile' && back.userIds, [USER, OTHER_USER]);
  // Ledger attribution still follows the destination.
  assertEquals(forward.kind === 'reconcile' && forward.primaryUserId, OTHER_USER);
  assertEquals(back.kind === 'reconcile' && back.primaryUserId, USER);
});

Deno.test('a transfer ignores anonymous IDs, normalises case, and needs a real user', () => {
  const upper = USER.toUpperCase();
  const decision = decide(transfer([ANONYMOUS], [upper]));
  assertEquals(decision.kind === 'reconcile' && decision.userIds, [USER]);
  assertEquals(decide(transfer([ANONYMOUS], ['not-a-user'])), {
    kind: 'ignore',
    reason: 'NO_ATTRIBUTABLE_USER',
    appUserId: null,
  });
});

Deno.test('a transfer missing its documented arrays is malformed, not guessed', () => {
  const body = transfer();
  delete body.event.transferred_to;
  assertEquals(decide(body), {
    kind: 'ignore',
    reason: 'MALFORMED_EVENT',
    appUserId: null,
  });
});

Deno.test('the old synthetic transfer shape no longer revokes from its payload', () => {
  // Earlier tests used a lifecycle-shaped TRANSFER with entitlement_ids. The
  // result must still be an authoritative read, never a payload-driven write.
  const decision = decide(
    initialPurchase({ type: 'TRANSFER', transferred_from: [OTHER_USER], transferred_to: [USER] }),
  );
  assertEquals(decision.kind, 'reconcile');
});

Deno.test('a redeemed purchase reconciles the redeemer', () => {
  const decision = decide(purchaseRedeemed());
  assertEquals(decision.kind === 'reconcile' && decision.userIds, [USER]);
});

Deno.test('a temporary grant without environment or entitlements reconciles its subject', () => {
  const decision = decide(temporaryEntitlementGrant());
  assertEquals(decision.kind === 'reconcile' && decision.userIds, [USER]);
});

Deno.test('the configured environment is enforced before any user is considered', () => {
  assertEquals(decide(initialPurchase(), 'PRODUCTION'), {
    kind: 'ignore',
    reason: 'ENVIRONMENT_MISMATCH',
    appUserId: USER,
  });
  assertEquals(decide(transfer(), 'PRODUCTION').kind === 'ignore', true);
  assertEquals(decide(initialPurchase({ environment: 'STAGING' })), {
    kind: 'ignore',
    reason: 'ENVIRONMENT_INVALID',
    appUserId: USER,
  });
});

Deno.test(
  'a lifecycle event without a provable environment is read from RevenueCat instead',
  () => {
    const decision = decide(initialPurchase({ environment: undefined }));
    assertEquals(decision.kind === 'reconcile' && decision.userIds, [USER]);
  },
);

Deno.test('missing entitlements or expiry defer instead of granting', () => {
  assertEquals(decide(initialPurchase({ entitlement_ids: null })).kind, 'reconcile');
  assertEquals(decide(initialPurchase({ expiration_at_ms: null })).kind, 'reconcile');
  const withoutKey = initialPurchase();
  delete withoutKey.event.expiration_at_ms;
  assertEquals(decide(withoutKey).kind, 'reconcile');
});

Deno.test('only a non-renewing purchase may apply a lifetime grant', () => {
  const decision = decide(
    initialPurchase({ type: 'NON_RENEWING_PURCHASE', expiration_at_ms: null }),
  );
  assertEquals(decision.kind === 'apply' && decision.expiresAt, null);
});

Deno.test('unattributable subscribers are terminal ignores', () => {
  assertEquals(decide(initialPurchase({ app_user_id: ANONYMOUS })), {
    kind: 'ignore',
    reason: 'ANONYMOUS_APP_USER_ID',
    appUserId: ANONYMOUS,
  });
  assertEquals(decide(initialPurchase({ app_user_id: 'user@example.com' })), {
    kind: 'ignore',
    reason: 'APP_USER_ID_NOT_A_USER',
    appUserId: 'user@example.com',
  });
  assertEquals(decide(initialPurchase({ app_user_id: 42 })), {
    kind: 'ignore',
    reason: 'MALFORMED_EVENT',
    appUserId: null,
  });
});

Deno.test('test and unhandled events are recorded, not applied', () => {
  assertEquals(decide(dashboardTest()), {
    kind: 'ignore',
    reason: 'TEST_EVENT',
    appUserId: 'test-user',
  });
  assertEquals(decide(invoiceIssuance()), {
    kind: 'ignore',
    reason: 'UNHANDLED_EVENT_TYPE',
    appUserId: USER,
  });
});

Deno.test('duplicate entitlement IDs collapse to one mirror write each', () => {
  const decision = decide(initialPurchase({ entitlement_ids: ['pro', 'pro', 'beta'] }));
  assertEquals(decision.kind === 'apply' && decision.entitlements, ['pro', 'beta']);
});
