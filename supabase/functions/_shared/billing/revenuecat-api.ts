import { z } from 'zod';

/**
 * Read-only RevenueCat Developer API v2 client for server-side reconciliation.
 *
 * Only four GET paths exist here, all project-scoped, all pinned to the
 * official origin. There is no method or path parameter a caller can widen.
 *
 * Pagination is traversed, not assumed: RevenueCat lists return
 * `{ object: "list", items, next_page, url }`, where `next_page` is a path
 * carrying `starting_after`. Each continuation must stay on the same resource
 * path, must not repeat, and the traversal is capped. Anything else fails
 * closed as PROVIDER_PAGINATION, because deciding access from a partial list
 * could revoke a paying user.
 */

export const REVENUECAT_API_ORIGIN = 'https://api.revenuecat.com';
const API_PREFIX = '/v2';
const MAX_PAGES = 25;
const MAX_RESPONSE_BYTES = 1_000_000;
export const REVENUECAT_API_TIMEOUT_MS = 10_000;

export type RevenueCatApiErrorCode =
  | 'PROVIDER_AUTH'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_MALFORMED'
  | 'PROVIDER_PAGINATION';

export class RevenueCatApiError extends Error {
  constructor(
    readonly code: RevenueCatApiErrorCode,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
    this.name = 'RevenueCatApiError';
  }
}

const identifierSchema = z.string().min(1).max(1500);
const nestedEntitlementsSchema = z.object({
  items: z.array(z.object({ id: identifierSchema }).passthrough()),
  next_page: z.string().min(1).nullable(),
});

export const catalogEntitlementSchema = z.object({
  id: identifierSchema,
  lookup_key: z.string().min(1).max(200),
});
export const activeEntitlementSchema = z.object({
  entitlement_id: identifierSchema,
  expires_at: z.number().int().nonnegative().nullable(),
});
export const customerSubscriptionSchema = z.object({
  id: identifierSchema,
  environment: z.enum(['production', 'sandbox']),
  gives_access: z.boolean(),
  entitlements: nestedEntitlementsSchema,
});
export const customerPurchaseSchema = z.object({
  id: identifierSchema,
  environment: z.enum(['production', 'sandbox']),
  status: z.string().min(1),
  entitlements: nestedEntitlementsSchema,
});

export type CatalogEntitlement = z.infer<typeof catalogEntitlementSchema>;
export type ActiveEntitlement = z.infer<typeof activeEntitlementSchema>;
export type CustomerSubscription = z.infer<typeof customerSubscriptionSchema>;
export type CustomerPurchase = z.infer<typeof customerPurchaseSchema>;

export interface RevenueCatReadApi {
  listEntitlements(): Promise<CatalogEntitlement[]>;
  listActiveEntitlements(customerId: string): Promise<ActiveEntitlement[]>;
  listSubscriptions(customerId: string): Promise<CustomerSubscription[]>;
  listPurchases(customerId: string): Promise<CustomerPurchase[]>;
}

export interface RevenueCatApiOptions {
  apiKey: string;
  projectId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const LIST_KEYS = new Set(['object', 'items', 'next_page', 'url']);
const CONTINUATION_KEY = /page|cursor|more|after|next|offset|continu/i;

export function createRevenueCatReadApi(options: RevenueCatApiOptions): RevenueCatReadApi {
  if (!options.apiKey.trim()) throw new RevenueCatApiError('PROVIDER_AUTH');
  if (!PROJECT_ID_PATTERN.test(options.projectId)) throw new RevenueCatApiError('PROVIDER_AUTH');

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REVENUECAT_API_TIMEOUT_MS;
  const project = `${API_PREFIX}/projects/${encodeURIComponent(options.projectId)}`;

  async function getJson(pathAndQuery: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${REVENUECAT_API_ORIGIN}${pathAndQuery}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${options.apiKey}`, Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new RevenueCatApiError('PROVIDER_UNAVAILABLE');
    }

    if (response.status === 401 || response.status === 403)
      throw new RevenueCatApiError('PROVIDER_AUTH');
    if (response.status === 404) throw new RevenueCatApiError('PROVIDER_NOT_FOUND');
    if (response.status === 429) {
      throw new RevenueCatApiError(
        'PROVIDER_RATE_LIMITED',
        retryAfter(response.headers.get('Retry-After')),
      );
    }
    if (response.status >= 500) throw new RevenueCatApiError('PROVIDER_UNAVAILABLE');
    if (response.status !== 200) {
      throw new RevenueCatApiError('PROVIDER_MALFORMED');
    }
    const text = await readBoundedBody(response);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RevenueCatApiError('PROVIDER_MALFORMED');
    }
  }

  async function listAll<T>(path: string, item: z.ZodType<T>): Promise<T[]> {
    const items: T[] = [];
    const seen = new Set<string>();
    let next: string | null = path;
    for (let page = 0; next !== null; page += 1) {
      if (page >= MAX_PAGES) throw new RevenueCatApiError('PROVIDER_PAGINATION');
      const body = await getJson(next);
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        throw new RevenueCatApiError('PROVIDER_MALFORMED');
      }
      // A continuation signal under any name other than next_page means this
      // client no longer understands the list shape.
      for (const key of Object.keys(body)) {
        if (!LIST_KEYS.has(key) && CONTINUATION_KEY.test(key)) {
          throw new RevenueCatApiError('PROVIDER_PAGINATION');
        }
      }
      const parsed = z
        .object({
          object: z.literal('list'),
          items: z.array(item),
          next_page: z.string().nullable(),
          url: z.string().min(1),
        })
        .safeParse(body);
      if (!parsed.success) throw new RevenueCatApiError('PROVIDER_MALFORMED');
      items.push(...parsed.data.items);
      next = continuation(parsed.data.next_page, path, seen);
    }
    return items;
  }

  const customer = (customerId: string) => `${project}/customers/${encodeURIComponent(customerId)}`;

  return {
    listEntitlements: () => listAll(`${project}/entitlements`, catalogEntitlementSchema),
    listActiveEntitlements: (customerId) =>
      listAll(`${customer(customerId)}/active_entitlements`, activeEntitlementSchema),
    listSubscriptions: async (customerId) =>
      assertNestedComplete(
        await listAll(`${customer(customerId)}/subscriptions`, customerSubscriptionSchema),
      ),
    listPurchases: async (customerId) =>
      assertNestedComplete(
        await listAll(`${customer(customerId)}/purchases`, customerPurchaseSchema),
      ),
  };
}

async function readBoundedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new RevenueCatApiError('PROVIDER_MALFORMED');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RevenueCatApiError('PROVIDER_MALFORMED');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof RevenueCatApiError) throw error;
    throw new RevenueCatApiError('PROVIDER_UNAVAILABLE');
  } finally {
    reader.releaseLock();
  }
}

/** Validate a next_page path and return it, or null at the end of the list. */
export function continuation(
  nextPage: string | null | undefined,
  resourcePath: string,
  seen: Set<string>,
): string | null {
  if (nextPage === null || nextPage === undefined) return null;
  let url: URL;
  try {
    url = new URL(nextPage, REVENUECAT_API_ORIGIN);
  } catch {
    throw new RevenueCatApiError('PROVIDER_PAGINATION');
  }
  const cursor = url.searchParams.get('starting_after');
  if (
    url.origin !== REVENUECAT_API_ORIGIN ||
    url.pathname !== resourcePath ||
    !cursor ||
    seen.has(cursor)
  ) {
    throw new RevenueCatApiError('PROVIDER_PAGINATION');
  }
  seen.add(cursor);
  return `${url.pathname}${url.search}`;
}

function assertNestedComplete<T extends { entitlements: { next_page?: string | null } }>(
  items: T[],
): T[] {
  if (items.some((entry) => typeof entry.entitlements.next_page === 'string')) {
    throw new RevenueCatApiError('PROVIDER_PAGINATION');
  }
  return items;
}

function retryAfter(value: string | null): number | null {
  if (value === null || !/^\d{1,5}$/.test(value.trim())) return null;
  return Math.min(Number(value.trim()), 86_400);
}
