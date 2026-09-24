import { assertEquals } from 'jsr:@std/assert@1';

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

interface Recorded {
  applied: { snapshotAt: string; snapshot: MirrorSnapshot | null }[];
  released: { code: string; retryAfter: number | null }[];
  catalogReads: number;
}

function harness(overrides: Partial<RevenueCatReadApi> = {}) {
  const recorded: Recorded = { applied: [], released: [], catalogReads: 0 };
  const api: RevenueCatReadApi = {
    listEntitlements: () => {
      recorded.catalogReads += 1;
      return Promise.resolve([{ id: 'entl_pro', lookup_key: 'pro' }]);
    },
    listActiveEntitlements: () =>
      Promise.resolve([{ entitlement_id: 'entl_pro', expires_at: NOW + 1_000_000 }]),
    listSubscriptions: () =>
      Promise.resolve([
        {
          id: 'sub_1',
          environment: 'sandbox',
          gives_access: true,
          entitlements: { items: [{ id: 'entl_pro' }], next_page: null },
        },
      ]),
    listPurchases: () => Promise.resolve([]),
    ...overrides,
  };
  const store: ReconcileStore = {
    applySnapshot({ snapshotAt, snapshot }) {
      recorded.applied.push({ snapshotAt, snapshot });
      return Promise.resolve(snapshot === null ? 'UNVERIFIED' : 'REPAIRED');
    },
    release(_userId, _lease, code, retryAfter) {
      recorded.released.push({ code, retryAfter });
      return Promise.resolve();
    },
  };
  const reconciler = createReconciler({ api, store, environment: 'SANDBOX', now: () => NOW });
  return { reconciler, recorded };
}

Deno.test('applies a snapshot dated before the reads by the clock margin', async () => {
  const { reconciler, recorded } = harness();
  assertEquals(await reconciler.reconcile(USER, 'lease'), 'REPAIRED');
  assertEquals(
    recorded.applied[0]?.snapshotAt,
    new Date(NOW - SNAPSHOT_CLOCK_MARGIN_MS).toISOString(),
  );
  assertEquals(recorded.applied[0]?.snapshot?.active, [
    { entitlement: 'pro', expires_at: new Date(NOW + 1_000_000).toISOString() },
  ]);
  assertEquals(recorded.released, []);
});

Deno.test('an unknown customer completes as unverified without revoking anything', async () => {
  const { reconciler, recorded } = harness({
    listActiveEntitlements: () => Promise.reject(new RevenueCatApiError('PROVIDER_NOT_FOUND')),
  });
  assertEquals(await reconciler.reconcile(USER, 'lease'), 'UNVERIFIED');
  assertEquals(recorded.applied[0]?.snapshot, null);
});

Deno.test(
  'a catalog 404 is a configuration fault, retried, never an unknown customer',
  async () => {
    const { reconciler, recorded } = harness({
      listEntitlements: () => Promise.reject(new RevenueCatApiError('PROVIDER_NOT_FOUND')),
    });
    assertEquals(await reconciler.reconcile(USER, 'lease'), 'RETRY');
    assertEquals(recorded.applied, []);
    assertEquals(recorded.released, [{ code: 'PROVIDER_NOT_FOUND', retryAfter: null }]);
  },
);

Deno.test(
  'transient, rate-limited, incomplete, and malformed reads release without writing',
  async () => {
    for (const [error, expected] of [
      [
        new RevenueCatApiError('PROVIDER_RATE_LIMITED', 30),
        { code: 'PROVIDER_RATE_LIMITED', retryAfter: 30 },
      ],
      [
        new RevenueCatApiError('PROVIDER_UNAVAILABLE'),
        { code: 'PROVIDER_UNAVAILABLE', retryAfter: null },
      ],
      [
        new RevenueCatApiError('PROVIDER_PAGINATION'),
        { code: 'PROVIDER_PAGINATION', retryAfter: null },
      ],
      [new Error('boom'), { code: 'RECONCILE_FAILED', retryAfter: null }],
    ] as const) {
      const { reconciler, recorded } = harness({ listSubscriptions: () => Promise.reject(error) });
      assertEquals(await reconciler.reconcile(USER, 'lease'), 'RETRY');
      assertEquals(recorded.applied, []);
      assertEquals(recorded.released, [expected]);
    }
  },
);

Deno.test('an unmappable active entitlement releases instead of revoking', async () => {
  const { reconciler, recorded } = harness({
    listActiveEntitlements: () =>
      Promise.resolve([{ entitlement_id: 'entl_other', expires_at: null }]),
  });
  assertEquals(await reconciler.reconcile(USER, 'lease'), 'RETRY');
  assertEquals(recorded.released[0]?.code, 'SNAPSHOT_UNKNOWN_ENTITLEMENT');
});

Deno.test('the catalog is read once per worker run', async () => {
  const { reconciler, recorded } = harness();
  await reconciler.reconcile(USER, 'a');
  await reconciler.reconcile(USER, 'b');
  assertEquals(recorded.catalogReads, 1);
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
