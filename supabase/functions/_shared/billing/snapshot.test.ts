import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import type { CustomerPurchase, CustomerSubscription } from './revenuecat-api.ts';
import { buildMirrorSnapshot, SnapshotError, type SnapshotInput } from './snapshot.ts';

const NOW = 1_760_000_000_000;
const PERIOD_END = NOW + 30 * 86_400_000;
const CATALOG = [
  { id: 'entl_pro', lookup_key: 'pro' },
  { id: 'entl_beta', lookup_key: 'beta' },
];

function subscription(overrides: Partial<CustomerSubscription> = {}): CustomerSubscription {
  return {
    id: 'sub_1',
    environment: 'sandbox',
    gives_access: true,
    entitlements: { items: [{ id: 'entl_pro' }], next_page: null },
    ...overrides,
  };
}

function purchase(overrides: Partial<CustomerPurchase> = {}): CustomerPurchase {
  return {
    id: 'purch_1',
    environment: 'sandbox',
    status: 'owned',
    entitlements: { items: [{ id: 'entl_pro' }], next_page: null },
    ...overrides,
  };
}

function input(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    environment: 'SANDBOX',
    catalog: CATALOG,
    active: [{ entitlement_id: 'entl_pro', expires_at: PERIOD_END }],
    subscriptions: [subscription()],
    purchases: [],
    nowMs: NOW,
    ...overrides,
  };
}

Deno.test('an active entitlement backed by an enforced-environment subscription is granted', () => {
  const snapshot = buildMirrorSnapshot(input());
  assertEquals(snapshot.active, [
    { entitlement: 'pro', expires_at: new Date(PERIOD_END).toISOString() },
  ]);
  assertEquals(snapshot.unverifiable, []);
});

Deno.test('a production deployment cannot be granted Pro by a sandbox subscription', () => {
  const snapshot = buildMirrorSnapshot(input({ environment: 'PRODUCTION' }));
  assertEquals(snapshot.active, []);
  assertEquals(snapshot.unverifiable, ['pro']);
});

Deno.test('sources in both environments are not attributable and change nothing', () => {
  const snapshot = buildMirrorSnapshot(
    input({
      subscriptions: [subscription(), subscription({ id: 'sub_2', environment: 'production' })],
    }),
  );
  assertEquals(snapshot.active, []);
  assertEquals(snapshot.unverifiable, ['pro']);
});

Deno.test('an active entitlement with no access-giving source is unverifiable, not granted', () => {
  // For example a promotional or temporary grant this deployment cannot attribute.
  const snapshot = buildMirrorSnapshot(
    input({ subscriptions: [subscription({ gives_access: false })] }),
  );
  assertEquals(snapshot.unverifiable, ['pro']);
});

Deno.test(
  'no active entitlement means nothing to grant, so the database revokes the mirror',
  () => {
    const snapshot = buildMirrorSnapshot(input({ active: [] }));
    assertEquals(snapshot.active, []);
    assertEquals(snapshot.unverifiable, []);
  },
);

Deno.test('an owned lifetime purchase grants without expiry; a refunded one does not count', () => {
  const lifetime = buildMirrorSnapshot(
    input({
      active: [{ entitlement_id: 'entl_pro', expires_at: null }],
      subscriptions: [],
      purchases: [purchase()],
    }),
  );
  assertEquals(lifetime.active, [{ entitlement: 'pro', expires_at: null }]);
  const refunded = buildMirrorSnapshot(
    input({ subscriptions: [], purchases: [purchase({ status: 'refunded' })] }),
  );
  assertEquals(refunded.unverifiable, ['pro']);
});

Deno.test('an entry RevenueCat already reports as expired is ignored', () => {
  const snapshot = buildMirrorSnapshot(
    input({ active: [{ entitlement_id: 'entl_pro', expires_at: NOW - 1 }] }),
  );
  assertEquals(snapshot.active, []);
});

Deno.test('an active entitlement missing from the catalog fails closed', () => {
  const error = assertThrows(
    () =>
      buildMirrorSnapshot(
        input({ active: [{ entitlement_id: 'entl_unknown', expires_at: PERIOD_END }] }),
      ),
    SnapshotError,
  );
  assertEquals(error.code, 'SNAPSHOT_UNKNOWN_ENTITLEMENT');
  const duplicate = assertThrows(
    () =>
      buildMirrorSnapshot(
        input({ catalog: [...CATALOG, { id: 'entl_pro_2', lookup_key: 'pro' }] }),
      ),
    SnapshotError,
  );
  assertEquals(duplicate.code, 'SNAPSHOT_DUPLICATE_LOOKUP_KEY');
});

Deno.test('the summary carries counts and lookup keys only', () => {
  const snapshot = buildMirrorSnapshot(input());
  assertEquals(snapshot.summary, {
    environment: 'SANDBOX',
    granted: ['pro'],
    unverifiable: [],
    subscriptions: 1,
    purchases: 0,
  });
});
