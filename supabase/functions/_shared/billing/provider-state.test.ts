import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import {
  openProviderAccess,
  type ProviderReadStart,
  type ProviderStateStore,
} from './provider-state.ts';
import { RevenueCatApiError, type RevenueCatReadApi } from './revenuecat-api.ts';

const CATALOG = [{ id: 'entl_pro', lookup_key: 'pro' }];

function setup(start: ProviderReadStart, listEntitlements?: RevenueCatReadApi['listEntitlements']) {
  const events: string[] = [];
  const unused = () => Promise.reject(new Error('customer reads are not part of this'));
  const api: RevenueCatReadApi = {
    listEntitlements:
      listEntitlements ??
      (() => {
        events.push('fetch');
        return Promise.resolve(CATALOG);
      }),
    listActiveEntitlements: unused,
    listSubscriptions: unused,
    listPurchases: unused,
  };
  const store: ProviderStateStore = {
    begin: () => Promise.resolve(start),
    completeCatalog(lease, catalog) {
      events.push(`complete:${lease}:${catalog.length}`);
      return Promise.resolve();
    },
    recordFailure(scope, lease, code, retryAfter) {
      events.push(`fail:${scope}:${lease}:${code}:${retryAfter}`);
      return Promise.resolve(300);
    },
  };
  return { api, store, events };
}

Deno.test('a blocked project reads nothing', async () => {
  const { api, store, events } = setup({ action: 'BLOCKED', retryAfterSeconds: 42 });
  assertEquals(await openProviderAccess(api, store), {
    ok: false,
    code: 'PROVIDER_BACKOFF',
    retryAfterSeconds: 42,
  });
  assertEquals(events, []);
});

Deno.test('a cached catalog is validated and used without a provider read', async () => {
  const { api, store, events } = setup({ action: 'USE', catalog: CATALOG });
  assertEquals(await openProviderAccess(api, store), { ok: true, catalog: CATALOG });
  assertEquals(events, []);

  const corrupt = setup({ action: 'USE', catalog: [{ id: 'entl_pro' }] });
  assertEquals((await openProviderAccess(corrupt.api, corrupt.store)).ok, false);
});

Deno.test('the lease holder fetches once and stores the catalog for everyone', async () => {
  const { api, store, events } = setup({ action: 'FETCH', leaseToken: 'lease', fallback: null });
  assertEquals(await openProviderAccess(api, store), { ok: true, catalog: CATALOG });
  assertEquals(events, ['fetch', 'complete:lease:1']);
});

Deno.test('a failed fetch records the shared backoff and returns its wait', async () => {
  const { api, store, events } = setup(
    { action: 'FETCH', leaseToken: 'lease', fallback: null },
    () => Promise.reject(new RevenueCatApiError('PROVIDER_RATE_LIMITED', 20)),
  );
  assertEquals(await openProviderAccess(api, store), {
    ok: false,
    code: 'PROVIDER_RATE_LIMITED',
    retryAfterSeconds: 300,
  });
  assertEquals(events, ['fail:CATALOG:lease:PROVIDER_RATE_LIMITED:20']);
});

Deno.test('the last good catalog survives a rate limit but not an auth failure', async () => {
  const limited = setup({ action: 'FETCH', leaseToken: 'lease', fallback: CATALOG }, () =>
    Promise.reject(new RevenueCatApiError('PROVIDER_RATE_LIMITED')),
  );
  assertEquals(await openProviderAccess(limited.api, limited.store), {
    ok: true,
    catalog: CATALOG,
  });

  const revoked = setup({ action: 'FETCH', leaseToken: 'lease', fallback: CATALOG }, () =>
    Promise.reject(new RevenueCatApiError('PROVIDER_AUTH')),
  );
  assertEquals((await openProviderAccess(revoked.api, revoked.store)).ok, false);
});

Deno.test('an unexpected error is not mistaken for a provider answer', async () => {
  const { api, store, events } = setup(
    { action: 'FETCH', leaseToken: 'lease', fallback: CATALOG },
    () => Promise.reject(new TypeError('bug')),
  );
  await assertRejects(() => openProviderAccess(api, store), TypeError);
  assertEquals(events, []);
});
