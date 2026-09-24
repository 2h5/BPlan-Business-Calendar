import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { createRevenueCatReadApi, RevenueCatApiError } from './revenuecat-api.ts';

const PROJECT = 'proj1ab2c3d4';
const CUSTOMER = '0f8b3a52-6c1e-4b8e-9a51-2d7c4e9f1a01';
const BASE = `/v2/projects/${PROJECT}`;

interface Seen {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(pages: Record<string, Response | (() => Response)>, seen: Seen[] = []) {
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    seen.push({ url, init });
    const path = url.replace('https://api.revenuecat.com', '');
    const page = pages[path];
    if (!page) return Promise.resolve(new Response('{}', { status: 404 }));
    return Promise.resolve(typeof page === 'function' ? page() : page.clone());
  };
}

function list(
  items: unknown[],
  nextPage: string | null = null,
  extra: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({ object: 'list', items, next_page: nextPage, url: 'x', ...extra }),
    {
      status: 200,
    },
  );
}

function api(pages: Record<string, Response | (() => Response)>, seen?: Seen[]) {
  return createRevenueCatReadApi({
    apiKey: 'sk_readonly',
    projectId: PROJECT,
    fetchImpl: fakeFetch(pages, seen),
  });
}

const ENTITLEMENT = {
  object: 'entitlement',
  id: 'entl_pro',
  lookup_key: 'pro',
  display_name: 'Pro',
};

Deno.test('only GETs the pinned origin with a bearer key and no redirects', async () => {
  const seen: Seen[] = [];
  await api({ [`${BASE}/entitlements`]: list([ENTITLEMENT]) }, seen).listEntitlements();
  assertEquals(seen[0]?.url, `https://api.revenuecat.com${BASE}/entitlements`);
  assertEquals(seen[0]?.init?.method, 'GET');
  assertEquals(seen[0]?.init?.redirect, 'error');
  assertEquals(new Headers(seen[0]?.init?.headers).get('Authorization'), 'Bearer sk_readonly');
});

Deno.test('traverses every page of a list through starting_after', async () => {
  const path = `${BASE}/customers/${CUSTOMER}/active_entitlements`;
  const result = await api({
    [path]: list(
      [{ object: 'customer.active_entitlement', entitlement_id: 'entl_a', expires_at: null }],
      `${path}?starting_after=entl_a`,
    ),
    [`${path}?starting_after=entl_a`]: list(
      [{ object: 'customer.active_entitlement', entitlement_id: 'entl_b', expires_at: 1 }],
      null,
    ),
  }).listActiveEntitlements(CUSTOMER);
  assertEquals(
    result.map((item) => item.entitlement_id),
    ['entl_a', 'entl_b'],
  );
});

async function paginationFailure(pages: Record<string, Response | (() => Response)>) {
  const error = await assertRejects(() => api(pages).listEntitlements(), RevenueCatApiError);
  return error.code;
}

Deno.test(
  'fails closed on a repeated, foreign, off-resource, or cursorless continuation',
  async () => {
    const path = `${BASE}/entitlements`;
    assertEquals(
      await paginationFailure({
        [path]: list([ENTITLEMENT], `${path}?starting_after=a`),
        [`${path}?starting_after=a`]: list([ENTITLEMENT], `${path}?starting_after=a`),
      }),
      'PROVIDER_PAGINATION',
    );
    assertEquals(
      await paginationFailure({
        [path]: list([ENTITLEMENT], `https://evil.example${path}?starting_after=a`),
      }),
      'PROVIDER_PAGINATION',
    );
    assertEquals(
      await paginationFailure({ [path]: list([ENTITLEMENT], `${BASE}/products?starting_after=a`) }),
      'PROVIDER_PAGINATION',
    );
    assertEquals(
      await paginationFailure({ [path]: list([ENTITLEMENT], path) }),
      'PROVIDER_PAGINATION',
    );
    assertEquals(
      await paginationFailure({ [path]: list([ENTITLEMENT], '') }),
      'PROVIDER_PAGINATION',
    );
  },
);

Deno.test('fails closed when a list signals continuation under another name', async () => {
  assertEquals(
    await paginationFailure({
      [`${BASE}/entitlements`]: list([ENTITLEMENT], null, { has_more: true }),
    }),
    'PROVIDER_PAGINATION',
  );
});

Deno.test(
  'fails closed when the required list envelope or continuation field is missing',
  async () => {
    const path = `${BASE}/entitlements`;
    for (const body of [
      { items: [ENTITLEMENT], next_page: null, url: path },
      { object: 'list', items: [ENTITLEMENT], url: path },
      { object: 'list', items: [ENTITLEMENT], next_page: null },
    ]) {
      assertEquals(
        await paginationFailure({ [path]: new Response(JSON.stringify(body), { status: 200 }) }),
        'PROVIDER_MALFORMED',
      );
    }
  },
);

Deno.test('caps traversal instead of following an endless list', async () => {
  const path = `${BASE}/entitlements`;
  let counter = 0;
  const endless = () => {
    counter += 1;
    return list([ENTITLEMENT], `${path}?starting_after=c${counter}`);
  };
  const pages: Record<string, () => Response> = { [path]: endless };
  for (let index = 1; index <= 30; index += 1) pages[`${path}?starting_after=c${index}`] = endless;
  assertEquals(await paginationFailure(pages), 'PROVIDER_PAGINATION');
});

Deno.test('fails closed on an incomplete nested entitlement list', async () => {
  const path = `${BASE}/customers/${CUSTOMER}/subscriptions`;
  const subscription = {
    id: 'sub_1',
    environment: 'sandbox',
    gives_access: true,
    entitlements: {
      object: 'list',
      items: [{ id: 'entl_pro' }],
      next_page: `${path}/x?starting_after=y`,
    },
  };
  const error = await assertRejects(
    () => api({ [path]: list([subscription]) }).listSubscriptions(CUSTOMER),
    RevenueCatApiError,
  );
  assertEquals(error.code, 'PROVIDER_PAGINATION');

  const missingCursor = {
    ...subscription,
    entitlements: { object: 'list', items: [{ id: 'entl_pro' }] },
  };
  const malformed = await assertRejects(
    () => api({ [path]: list([missingCursor]) }).listSubscriptions(CUSTOMER),
    RevenueCatApiError,
  );
  assertEquals(malformed.code, 'PROVIDER_MALFORMED');
});

Deno.test('maps provider status codes to stable, retryable-or-not error codes', async () => {
  const path = `${BASE}/entitlements`;
  for (const [response, code] of [
    [new Response('{}', { status: 401 }), 'PROVIDER_AUTH'],
    [new Response('{}', { status: 403 }), 'PROVIDER_AUTH'],
    [new Response('{}', { status: 404 }), 'PROVIDER_NOT_FOUND'],
    [new Response('{}', { status: 503 }), 'PROVIDER_UNAVAILABLE'],
    [new Response('not json', { status: 200 }), 'PROVIDER_MALFORMED'],
    [new Response(JSON.stringify({ items: [{ id: 'x' }] }), { status: 200 }), 'PROVIDER_MALFORMED'],
  ] as const) {
    const error = await assertRejects(
      () => api({ [path]: response }).listEntitlements(),
      RevenueCatApiError,
    );
    assertEquals(error.code, code);
  }
  const limited = await assertRejects(
    () =>
      api({
        [path]: new Response('{}', { status: 429, headers: { 'Retry-After': '42' } }),
      }).listEntitlements(),
    RevenueCatApiError,
  );
  assertEquals([limited.code, limited.retryAfterSeconds], ['PROVIDER_RATE_LIMITED', 42]);
});

Deno.test('a network failure is transient', async () => {
  const failing = createRevenueCatReadApi({
    apiKey: 'sk',
    projectId: PROJECT,
    fetchImpl: () => Promise.reject(new TypeError('offline')),
  });
  const error = await assertRejects(() => failing.listEntitlements(), RevenueCatApiError);
  assertEquals(error.code, 'PROVIDER_UNAVAILABLE');
});

Deno.test('rejects an oversized response while reading its stream', async () => {
  const path = `${BASE}/entitlements`;
  const oversized = new Response('x'.repeat(1_000_001), { status: 200 });
  assertEquals(await paginationFailure({ [path]: oversized }), 'PROVIDER_MALFORMED');
});

Deno.test('refuses an empty key or an unsafe project ID before any request', () => {
  for (const options of [
    { apiKey: ' ', projectId: PROJECT },
    { apiKey: 'sk', projectId: '../other' },
  ]) {
    let code = '';
    try {
      createRevenueCatReadApi(options);
    } catch (error) {
      code = error instanceof RevenueCatApiError ? error.code : 'OTHER';
    }
    assertEquals(code, 'PROVIDER_AUTH');
  }
});
