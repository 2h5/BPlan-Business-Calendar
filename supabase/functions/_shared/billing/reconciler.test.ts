import { assertEquals } from 'jsr:@std/assert@1';

import type { ProviderReadStart, ProviderStateStore } from './provider-state.ts';
import {
  createReconciler,
  readReconcileConfig,
  SNAPSHOT_CLOCK_MARGIN_MS,
  type ReconcileStore,
} from './reconciler.ts';
import { RevenueCatApiError, type RevenueCatReadApi } from './revenuecat-api.ts';
import type { MirrorSnapshot } from './snapshot.ts';

const USER = '0f8b3a52-6c1e-4b8e-9a51-2d7c4e9f1a01';
const NOW = 1_760_000_000_000;
const CATALOG = [{ id: 'entl_pro', lookup_key: 'pro' }];

interface Recorded {
  applied: { snapshotAt: string; snapshot: MirrorSnapshot | null }[];
  released: { code: string; retryAfter: number | null; countAttempt: boolean }[];
  catalogReads: number;
  customerReads: number;
  providerFailures: { scope: string; code: string }[];
}

function harness(
  overrides: Partial<RevenueCatReadApi> = {},
  start: ProviderReadStart = { action: 'USE', catalog: CATALOG },
) {
  const recorded: Recorded = {
    applied: [],
    released: [],
    catalogReads: 0,
    customerReads: 0,
    providerFailures: [],
  };
  const customer = <T>(value: T) => {
    recorded.customerReads += 1;
    return Promise.resolve(value);
  };
  const api: RevenueCatReadApi = {
    listEntitlements: () => {
      recorded.catalogReads += 1;
      return Promise.resolve(CATALOG);
    },
    listActiveEntitlements: () =>
      customer([{ entitlement_id: 'entl_pro', expires_at: NOW + 1_000_000 }]),
    listSubscriptions: () =>
      customer([
        {
          id: 'sub_1',
          environment: 'sandbox' as const,
          gives_access: true,
          entitlements: { items: [{ id: 'entl_pro' }], next_page: null },
        },
      ]),
    listPurchases: () => customer([]),
    ...overrides,
  };
  const store: ReconcileStore = {
    applySnapshot({ snapshotAt, snapshot }) {
      recorded.applied.push({ snapshotAt, snapshot });
      return Promise.resolve(snapshot === null ? 'UNVERIFIED' : 'REPAIRED');
    },
    release(_userId, _lease, code, retryAfter, countAttempt) {
      recorded.released.push({ code, retryAfter, countAttempt });
      return Promise.resolve();
    },
  };
  let begins = 0;
  const provider: ProviderStateStore = {
    begin() {
      begins += 1;
      return Promise.resolve(start);
    },
    completeCatalog: () => Promise.resolve(),
    recordFailure(scope, _lease, code) {
      recorded.providerFailures.push({ scope, code });
      return Promise.resolve(120);
    },
  };
  const reconciler = createReconciler({
    api,
    store,
    provider,
    environment: 'SANDBOX',
    now: () => NOW,
  });
  return { reconciler, recorded, begins: () => begins };
}

Deno.test('applies a snapshot dated before the reads by the clock margin', async () => {
  const { reconciler, recorded } = harness();
  assertEquals(await reconciler.reconcile(USER, 'lease'), {
    outcome: 'REPAIRED',
    retryAfterSeconds: null,
  });
  assertEquals(
    recorded.applied[0]?.snapshotAt,
    new Date(NOW - SNAPSHOT_CLOCK_MARGIN_MS).toISOString(),
  );
  assertEquals(recorded.applied[0]?.snapshot?.active, [
    { entitlement: 'pro', expires_at: new Date(NOW + 1_000_000).toISOString() },
  ]);
  assertEquals(recorded.released, []);
});

Deno.test('uses the shared cached catalog without reading RevenueCat configuration', async () => {
  const { reconciler, recorded } = harness();
  await reconciler.reconcile(USER, 'lease');
  assertEquals(recorded.catalogReads, 0);
});

Deno.test('project state is resolved once per instance, not once per user', async () => {
  const { reconciler, recorded, begins } = harness(
    {},
    { action: 'FETCH', leaseToken: 'catalog-lease', fallback: null },
  );
  await reconciler.reconcile(USER, 'a');
  await reconciler.reconcile(USER, 'b');
  assertEquals(begins(), 1);
  assertEquals(recorded.catalogReads, 1);
});

Deno.test('a project-wide backoff hands the lease back unread and uncounted', async () => {
  const { reconciler, recorded } = harness({}, { action: 'BLOCKED', retryAfterSeconds: 90 });
  assertEquals(await reconciler.reconcile(USER, 'lease'), {
    outcome: 'BACKING_OFF',
    retryAfterSeconds: 90,
  });
  assertEquals(recorded.customerReads, 0);
  assertEquals(recorded.applied, []);
  assertEquals(recorded.released, [
    { code: 'PROVIDER_BACKOFF', retryAfter: 90, countAttempt: false },
  ]);
});

Deno.test('a failed catalog read is not retried for the next user', async () => {
  let reads = 0;
  const { reconciler, recorded } = harness(
    {
      listEntitlements: () => {
        reads += 1;
        return Promise.reject(new RevenueCatApiError('PROVIDER_RATE_LIMITED', 30));
      },
    },
    { action: 'FETCH', leaseToken: 'catalog-lease', fallback: null },
  );
  for (const lease of ['a', 'b', 'c']) {
    assertEquals((await reconciler.reconcile(USER, lease)).outcome, 'BACKING_OFF');
  }
  assertEquals(reads, 1);
  assertEquals(recorded.providerFailures, [{ scope: 'CATALOG', code: 'PROVIDER_RATE_LIMITED' }]);
  assertEquals(recorded.customerReads, 0);
  assertEquals(
    recorded.released.every((entry) => !entry.countAttempt && entry.retryAfter === 120),
    true,
  );
});

Deno.test('a rate-limited catalog read falls back to the last good catalog', async () => {
  const { reconciler, recorded } = harness(
    { listEntitlements: () => Promise.reject(new RevenueCatApiError('PROVIDER_RATE_LIMITED')) },
    { action: 'FETCH', leaseToken: 'catalog-lease', fallback: CATALOG },
  );
  assertEquals((await reconciler.reconcile(USER, 'lease')).outcome, 'REPAIRED');
  assertEquals(recorded.providerFailures, [{ scope: 'CATALOG', code: 'PROVIDER_RATE_LIMITED' }]);
});

Deno.test('a catalog 404 is a configuration fault, never an unknown customer', async () => {
  const { reconciler, recorded } = harness(
    { listEntitlements: () => Promise.reject(new RevenueCatApiError('PROVIDER_NOT_FOUND')) },
    { action: 'FETCH', leaseToken: 'catalog-lease', fallback: null },
  );
  assertEquals((await reconciler.reconcile(USER, 'lease')).outcome, 'BACKING_OFF');
  assertEquals(recorded.applied, []);
  assertEquals(recorded.released[0]?.code, 'PROVIDER_NOT_FOUND');
});

Deno.test('an unknown customer completes as unverified without revoking anything', async () => {
  const { reconciler, recorded } = harness({
    listActiveEntitlements: () => Promise.reject(new RevenueCatApiError('PROVIDER_NOT_FOUND')),
  });
  assertEquals((await reconciler.reconcile(USER, 'lease')).outcome, 'UNVERIFIED');
  assertEquals(recorded.applied[0]?.snapshot, null);
});

Deno.test(
  'a project-wide customer failure blocks the project and stops this instance reading',
  async () => {
    for (const code of ['PROVIDER_RATE_LIMITED', 'PROVIDER_AUTH'] as const) {
      let reads = 0;
      const { reconciler, recorded } = harness({
        listSubscriptions: () => {
          reads += 1;
          return Promise.reject(new RevenueCatApiError(code, 45));
        },
      });
      assertEquals(await reconciler.reconcile(USER, 'a'), {
        outcome: 'BACKING_OFF',
        retryAfterSeconds: 120,
      });
      assertEquals((await reconciler.reconcile(USER, 'b')).outcome, 'BACKING_OFF');
      assertEquals(reads, 1);
      assertEquals(recorded.providerFailures, [{ scope: 'CUSTOMER', code }]);
      assertEquals(recorded.applied, []);
      assertEquals(
        recorded.released.map((entry) => entry.countAttempt),
        [false, false],
      );
    }
  },
);

Deno.test('customer-specific failures release with a counted attempt', async () => {
  for (const [error, expected] of [
    [
      new RevenueCatApiError('PROVIDER_UNAVAILABLE'),
      { code: 'PROVIDER_UNAVAILABLE', retryAfter: null, countAttempt: true },
    ],
    [
      new RevenueCatApiError('PROVIDER_PAGINATION'),
      { code: 'PROVIDER_PAGINATION', retryAfter: null, countAttempt: true },
    ],
    [new Error('boom'), { code: 'RECONCILE_FAILED', retryAfter: null, countAttempt: true }],
  ] as const) {
    const { reconciler, recorded } = harness({ listSubscriptions: () => Promise.reject(error) });
    assertEquals((await reconciler.reconcile(USER, 'lease')).outcome, 'RETRY');
    assertEquals(recorded.applied, []);
    assertEquals(recorded.released, [expected]);
    assertEquals(recorded.providerFailures, []);
  }
});

Deno.test('an unmappable active entitlement releases instead of revoking', async () => {
  const { reconciler, recorded } = harness({
    listActiveEntitlements: () =>
      Promise.resolve([{ entitlement_id: 'entl_other', expires_at: null }]),
  });
  assertEquals((await reconciler.reconcile(USER, 'lease')).outcome, 'RETRY');
  assertEquals(recorded.released[0]?.code, 'SNAPSHOT_UNKNOWN_ENTITLEMENT');
});

Deno.test('configuration names the read-only key and requires every value', () => {
  assertEquals(
    readReconcileConfig(() => undefined),
    {
      ok: false,
      missing: ['REVENUECAT_READONLY_API_KEY', 'REVENUECAT_PROJECT_ID', 'REVENUECAT_ENVIRONMENT'],
    },
  );
  const values: Record<string, string> = {
    REVENUECAT_READONLY_API_KEY: 'sk',
    REVENUECAT_PROJECT_ID: 'proj',
    REVENUECAT_ENVIRONMENT: 'sandbox',
  };
  assertEquals(readReconcileConfig((name) => values[name]).ok, false);
  values.REVENUECAT_ENVIRONMENT = 'SANDBOX';
  assertEquals(
    readReconcileConfig((name) => values[name]),
    {
      ok: true,
      config: { apiKey: 'sk', projectId: 'proj', environment: 'SANDBOX' },
    },
  );
});
