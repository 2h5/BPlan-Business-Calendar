import { revenueCatEnvironmentSchema, type RevenueCatEnvironment } from '@cal/schemas/subscription';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createRevenueCatReadApi,
  RevenueCatApiError,
  type CatalogEntitlement,
  type RevenueCatReadApi,
} from './revenuecat-api.ts';
import { buildMirrorSnapshot, SnapshotError, type MirrorSnapshot } from './snapshot.ts';

/**
 * Authoritative convergence for the Pro mirror.
 *
 * Webhooks are hints. This reads RevenueCat's customer state for one leased
 * user and hands the database a snapshot, which it applies through the same
 * ordering guard as the webhook: a webhook newer than the snapshot wins, and a
 * snapshot never regresses newer state.
 *
 * The snapshot time is taken before the first read and moved back by a clock
 * margin. An event RevenueCat generated before the read is already reflected
 * in what the read returns; one generated during or after it is newer than
 * the snapshot and still applies when its webhook arrives.
 */

export const SNAPSHOT_CLOCK_MARGIN_MS = 60_000;
export const RECONCILE_LEASE_SECONDS = 120;

export type ReconcileOutcome =
  'REPAIRED' | 'CONVERGED' | 'STALE' | 'UNVERIFIED' | 'LEASE_LOST' | 'RETRY';

export interface ReconcileStore {
  applySnapshot(input: {
    userId: string;
    leaseToken: string;
    snapshotAt: string;
    environment: RevenueCatEnvironment;
    snapshot: MirrorSnapshot | null;
  }): Promise<Exclude<ReconcileOutcome, 'RETRY'>>;
  release(
    userId: string,
    leaseToken: string,
    code: string,
    retryAfterSeconds: number | null,
  ): Promise<void>;
}

export interface ReconcileConfig {
  apiKey: string;
  projectId: string;
  environment: RevenueCatEnvironment;
}

export type ReconcileConfigResult =
  { ok: true; config: ReconcileConfig } | { ok: false; missing: string[] };

/** The reconciler needs a read-only key; it never receives a write-capable one by name. */
export function readReconcileConfig(
  read: (name: string) => string | undefined,
): ReconcileConfigResult {
  const apiKey = read('REVENUECAT_READONLY_API_KEY')?.trim();
  const projectId = read('REVENUECAT_PROJECT_ID')?.trim();
  const environment = revenueCatEnvironmentSchema.safeParse(read('REVENUECAT_ENVIRONMENT'));
  const missing = [
    ...(apiKey ? [] : ['REVENUECAT_READONLY_API_KEY']),
    ...(projectId ? [] : ['REVENUECAT_PROJECT_ID']),
    ...(environment.success ? [] : ['REVENUECAT_ENVIRONMENT']),
  ];
  if (!apiKey || !projectId || !environment.success) return { ok: false, missing };
  return { ok: true, config: { apiKey, projectId, environment: environment.data } };
}

export interface Reconciler {
  reconcile(userId: string, leaseToken: string): Promise<ReconcileOutcome>;
}

export function createReconciler(deps: {
  api: RevenueCatReadApi;
  store: ReconcileStore;
  environment: RevenueCatEnvironment;
  now?: () => number;
}): Reconciler {
  const now = deps.now ?? Date.now;
  // One catalog read per worker run: it is project configuration, rate
  // limited separately and far more tightly than customer reads.
  let catalog: Promise<CatalogEntitlement[]> | null = null;

  return {
    async reconcile(userId, leaseToken) {
      const retry = async (error: unknown): Promise<ReconcileOutcome> => {
        const code =
          error instanceof RevenueCatApiError || error instanceof SnapshotError
            ? error.code
            : 'RECONCILE_FAILED';
        const retryAfter = error instanceof RevenueCatApiError ? error.retryAfterSeconds : null;
        await deps.store.release(userId, leaseToken, code, retryAfter);
        return 'RETRY';
      };

      const snapshotAt = new Date(now() - SNAPSHOT_CLOCK_MARGIN_MS);

      // The catalog is read on its own so that its 404 (a wrong project ID)
      // can never be mistaken for an unknown customer.
      let entitlements: CatalogEntitlement[];
      try {
        catalog ??= deps.api.listEntitlements();
        entitlements = await catalog;
      } catch (error) {
        catalog = null;
        return await retry(error);
      }

      let snapshot: MirrorSnapshot | null;
      try {
        const [active, subscriptions, purchases] = await Promise.all([
          deps.api.listActiveEntitlements(userId),
          deps.api.listSubscriptions(userId),
          deps.api.listPurchases(userId),
        ]);
        snapshot = buildMirrorSnapshot({
          environment: deps.environment,
          catalog: entitlements,
          active,
          subscriptions,
          purchases,
          nowMs: now(),
        });
      } catch (error) {
        // RevenueCat has no such customer: nothing to grant, and no proof
        // either way for rows the mirror already holds.
        if (!(error instanceof RevenueCatApiError && error.code === 'PROVIDER_NOT_FOUND')) {
          return await retry(error);
        }
        snapshot = null;
      }

      return await deps.store.applySnapshot({
        userId,
        leaseToken,
        snapshotAt: snapshotAt.toISOString(),
        environment: deps.environment,
        snapshot,
      });
    },
  };
}

const OUTCOMES = ['REPAIRED', 'CONVERGED', 'STALE', 'UNVERIFIED', 'LEASE_LOST'] as const;

export function supabaseReconcileStore(admin: SupabaseClient): ReconcileStore {
  return {
    async applySnapshot({ userId, leaseToken, snapshotAt, environment, snapshot }) {
      const { data, error } = await admin.rpc('apply_revenuecat_snapshot', {
        p_user_id: userId,
        p_lease_token: leaseToken,
        p_snapshot_at: snapshotAt,
        p_environment: environment,
        p_active: snapshot === null ? null : snapshot.active,
        p_unverifiable: snapshot === null ? [] : snapshot.unverifiable,
        p_summary: snapshot === null ? { environment, customer: 'not_found' } : snapshot.summary,
      });
      if (error) throw error;
      const outcome = OUTCOMES.find((value) => value === data);
      if (!outcome) throw new Error('Unexpected reconciliation outcome');
      return outcome;
    },
    async release(userId, leaseToken, code, retryAfterSeconds) {
      const { error } = await admin.rpc('release_revenuecat_reconciliation', {
        p_user_id: userId,
        p_lease_token: leaseToken,
        p_error_code: code,
        p_retry_after_seconds: retryAfterSeconds,
      });
      if (error) throw error;
    },
  };
}

export function createConfiguredReconciler(
  admin: SupabaseClient,
  config: ReconcileConfig,
): Reconciler {
  return createReconciler({
    api: createRevenueCatReadApi({ apiKey: config.apiKey, projectId: config.projectId }),
    store: supabaseReconcileStore(admin),
    environment: config.environment,
  });
}
