import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  catalogEntitlementSchema,
  RevenueCatApiError,
  type CatalogEntitlement,
  type RevenueCatReadApi,
} from './revenuecat-api.ts';

/**
 * Project-wide RevenueCat read state, shared through the database by every
 * worker run and every user refresh.
 *
 * The entitlement catalog is read from RevenueCat's project-configuration rate
 * limit (60 requests a minute per key). It is cached in
 * `revenuecat_provider_state`, fetched by at most one leaseholder at a time,
 * and backed off on failure, so refresh traffic cannot spend that limit. A
 * project-wide customer-read failure (an invalid key, or 429) blocks all
 * RevenueCat reads until the backoff ends.
 */

export type ProviderReadStart =
  | { action: 'USE'; catalog: unknown }
  | { action: 'FETCH'; leaseToken: string; fallback: unknown }
  | { action: 'BLOCKED'; retryAfterSeconds: number };

export type ProviderFailureScope = 'CATALOG' | 'CUSTOMER';

export interface ProviderStateStore {
  begin(): Promise<ProviderReadStart>;
  completeCatalog(leaseToken: string, catalog: CatalogEntitlement[]): Promise<void>;
  /** Returns how many seconds callers must wait. */
  recordFailure(
    scope: ProviderFailureScope,
    leaseToken: string | null,
    code: string,
    retryAfterSeconds: number | null,
  ): Promise<number>;
}

export type ProviderAccess =
  | { ok: true; catalog: CatalogEntitlement[] }
  | { ok: false; code: string; retryAfterSeconds: number };

const catalogSchema = z.array(catalogEntitlementSchema);

/** A failure that says the whole project, not one customer, cannot be read now. */
export function isProjectWideFailure(error: unknown): error is RevenueCatApiError {
  return (
    error instanceof RevenueCatApiError &&
    (error.code === 'PROVIDER_AUTH' || error.code === 'PROVIDER_RATE_LIMITED')
  );
}

/** Resolve the catalog for this run, reading RevenueCat only when the shared state allows it. */
export async function openProviderAccess(
  api: RevenueCatReadApi,
  store: ProviderStateStore,
): Promise<ProviderAccess> {
  const start = await store.begin();
  if (start.action === 'BLOCKED') {
    return { ok: false, code: 'PROVIDER_BACKOFF', retryAfterSeconds: start.retryAfterSeconds };
  }
  if (start.action === 'USE') return cached(start.catalog);

  let catalog: CatalogEntitlement[];
  try {
    catalog = await api.listEntitlements();
  } catch (error) {
    if (!(error instanceof RevenueCatApiError)) throw error;
    const retryAfterSeconds = await store.recordFailure(
      'CATALOG',
      start.leaseToken,
      error.code,
      error.retryAfterSeconds,
    );
    // A rate-limited or unavailable catalog read does not make yesterday's
    // catalog wrong; an authentication failure means nothing can be read.
    if (error.code !== 'PROVIDER_AUTH' && start.fallback !== null) {
      const fallback = cached(start.fallback);
      if (fallback.ok) return fallback;
    }
    return { ok: false, code: error.code, retryAfterSeconds };
  }
  await store.completeCatalog(start.leaseToken, catalog);
  return { ok: true, catalog };
}

function cached(value: unknown): ProviderAccess {
  const parsed = catalogSchema.safeParse(value);
  return parsed.success
    ? { ok: true, catalog: parsed.data }
    : { ok: false, code: 'CATALOG_MALFORMED', retryAfterSeconds: 60 };
}

const startRowSchema = z.object({
  action: z.enum(['USE', 'FETCH', 'BLOCKED']),
  catalog: z.unknown(),
  lease_token: z.string().uuid().nullable(),
  retry_after_seconds: z.number().int().positive().nullable(),
});

export function supabaseProviderStateStore(
  admin: SupabaseClient,
  projectId: string,
): ProviderStateStore {
  return {
    async begin() {
      const { data, error } = await admin.rpc('begin_revenuecat_provider_read', {
        p_project_id: projectId,
      });
      if (error) throw error;
      const row = startRowSchema.parse(Array.isArray(data) ? data[0] : undefined);
      if (row.action === 'USE') return { action: 'USE', catalog: row.catalog };
      if (row.action === 'FETCH' && row.lease_token !== null) {
        return { action: 'FETCH', leaseToken: row.lease_token, fallback: row.catalog ?? null };
      }
      if (row.action === 'BLOCKED' && row.retry_after_seconds !== null) {
        return { action: 'BLOCKED', retryAfterSeconds: row.retry_after_seconds };
      }
      throw new Error('Unexpected RevenueCat provider state');
    },
    async completeCatalog(leaseToken, catalog) {
      const { error } = await admin.rpc('complete_revenuecat_catalog_read', {
        p_project_id: projectId,
        p_lease_token: leaseToken,
        p_catalog: catalog.map(({ id, lookup_key }) => ({ id, lookup_key })),
      });
      if (error) throw error;
    },
    async recordFailure(scope, leaseToken, code, retryAfterSeconds) {
      const { data, error } = await admin.rpc('record_revenuecat_provider_failure', {
        p_project_id: projectId,
        p_scope: scope,
        p_lease_token: leaseToken,
        p_error_code: code,
        p_retry_after_seconds: retryAfterSeconds,
      });
      if (error) throw error;
      return z.number().int().positive().parse(data);
    },
  };
}
