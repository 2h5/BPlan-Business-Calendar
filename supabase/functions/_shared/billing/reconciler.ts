import { revenueCatEnvironmentSchema, type RevenueCatEnvironment } from '@cal/schemas/subscription';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isProjectWideFailure,
  openProviderAccess,
  supabaseProviderStateStore,
  type ProviderAccess,
  type ProviderStateStore,
} from './provider-state.ts';
import {
  createRevenueCatReadApi,
  RevenueCatApiError,
  type RevenueCatReadApi,
} from './revenuecat-api.ts';
import { buildMirrorSnapshot, SnapshotError, type MirrorSnapshot } from './snapshot.ts';

/**
 * Authoritative convergence for the Pro mirror.
 *
 * Webhooks are hints. This reads RevenueCat's customer state for one leased
 * user and hands the database a snapshot, which it applies through the same
 * ordering guard as the webhook: a webhook newer than the snapshot wins, and a
 * snapshot never regresses newer state. When a newer webhook wins, the
 * database keeps the request pending and retries after the clock margin.
 *
 * The snapshot time is taken before the first read and moved back by a clock
 * margin. An event RevenueCat generated before the read is already reflected
 * in what the read returns; one generated during or after it is newer than
 * the snapshot and still applies when its webhook arrives.
 *
 * Project-wide state (the entitlement catalog and any provider backoff) is
 * resolved once per reconciler instance through `revenuecat_provider_state`,
 * so a worker run or a refresh never reads the catalog per user, and a
 * project-wide failure hands leases back without counting them against users.
 */

export const SNAPSHOT_CLOCK_MARGIN_MS = 60_000;
export const RECONCILE_LEASE_SECONDS = 120;

export type ReconcileOutcome =
  'REPAIRED' | 'CONVERGED' | 'STALE' | 'UNVERIFIED' | 'LEASE_LOST' | 'RETRY' | 'BACKING_OFF';

export interface ReconcileResult {
  outcome: ReconcileOutcome;
  /** Set for BACKING_OFF: when RevenueCat may be read again. */
  retryAfterSeconds: number | null;
}

type SnapshotOutcome = Exclude<ReconcileOutcome, 'RETRY' | 'BACKING_OFF'>;

export interface ReconcileStore {
  applySnapshot(input: {
    userId: string;
    leaseToken: string;
    snapshotAt: string;
    environment: RevenueCatEnvironment;
    snapshot: MirrorSnapshot | null;
  }): Promise<SnapshotOutcome>;
  /**
   * countAttempt false hands the lease back for a reason unrelated to this
   * user, waiting exactly retryAfterSeconds without growing their backoff.
   */
  release(
    userId: string,
    leaseToken: string,
    code: string,
    retryAfterSeconds: number | null,
    countAttempt: boolean,
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
  /** Resolve project-wide readiness once; later calls reuse the answer. */
  prepare(): Promise<ProviderAccess>;
  reconcile(userId: string, leaseToken: string): Promise<ReconcileResult>;
}

export function createReconciler(deps: {
  api: RevenueCatReadApi;
  store: ReconcileStore;
  provider: ProviderStateStore;
  environment: RevenueCatEnvironment;
  now?: () => number;
}): Reconciler {
  const now = deps.now ?? Date.now;
  let access: Promise<ProviderAccess> | null = null;

  const prepare = (): Promise<ProviderAccess> => {
    access ??= openProviderAccess(deps.api, deps.provider).catch((error: unknown) => {
      // A database failure is not an answer; let the next call ask again.
      access = null;
      throw error;
    });
    return access;
  };

  const backOff = async (
    userId: string,
    leaseToken: string,
    code: string,
    retryAfterSeconds: number,
  ): Promise<ReconcileResult> => {
    await deps.store.release(userId, leaseToken, code, retryAfterSeconds, false);
    return { outcome: 'BACKING_OFF', retryAfterSeconds };
  };

  return {
    prepare,
    async reconcile(userId, leaseToken) {
      const ready = await prepare();
      if (!ready.ok) return await backOff(userId, leaseToken, ready.code, ready.retryAfterSeconds);

      const snapshotAt = new Date(now() - SNAPSHOT_CLOCK_MARGIN_MS);

      let snapshot: MirrorSnapshot | null;
      try {
        const [active, subscriptions, purchases] = await Promise.all([
          deps.api.listActiveEntitlements(userId),
          deps.api.listSubscriptions(userId),
          deps.api.listPurchases(userId),
        ]);
        snapshot = buildMirrorSnapshot({
          environment: deps.environment,
          catalog: ready.catalog,
          active,
          subscriptions,
          purchases,
          nowMs: now(),
        });
      } catch (error) {
        if (isProjectWideFailure(error)) {
          // Every other customer read would fail the same way. Block the
          // project for everyone, and stop this instance reading too.
          const retryAfterSeconds = await deps.provider.recordFailure(
            'CUSTOMER',
            null,
            error.code,
            error.retryAfterSeconds,
          );
          access = Promise.resolve({ ok: false, code: 'PROVIDER_BACKOFF', retryAfterSeconds });
          return await backOff(userId, leaseToken, error.code, retryAfterSeconds);
        }
        // RevenueCat has no such customer: nothing to grant, and no proof
        // either way for rows the mirror already holds.
        if (!(error instanceof RevenueCatApiError && error.code === 'PROVIDER_NOT_FOUND')) {
          const code =
            error instanceof RevenueCatApiError || error instanceof SnapshotError
              ? error.code
              : 'RECONCILE_FAILED';
          const retryAfter = error instanceof RevenueCatApiError ? error.retryAfterSeconds : null;
          await deps.store.release(userId, leaseToken, code, retryAfter, true);
          return { outcome: 'RETRY', retryAfterSeconds: null };
        }
        snapshot = null;
      }

      const outcome = await deps.store.applySnapshot({
        userId,
        leaseToken,
        snapshotAt: snapshotAt.toISOString(),
        environment: deps.environment,
        snapshot,
      });
      return { outcome, retryAfterSeconds: null };
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
    release: (userId, leaseToken, code, retryAfterSeconds, countAttempt) =>
      releaseReconciliation(admin, userId, leaseToken, code, retryAfterSeconds, countAttempt),
  };
}

export async function releaseReconciliation(
  admin: SupabaseClient,
  userId: string,
  leaseToken: string,
  code: string,
  retryAfterSeconds: number | null,
  countAttempt: boolean,
): Promise<void> {
  const { error } = await admin.rpc('release_revenuecat_reconciliation', {
    p_user_id: userId,
    p_lease_token: leaseToken,
    p_error_code: code,
    p_retry_after_seconds: retryAfterSeconds,
    p_count_attempt: countAttempt,
  });
  if (error) throw error;
}

export function createConfiguredReconciler(
  admin: SupabaseClient,
  config: ReconcileConfig,
): Reconciler {
  return createReconciler({
    api: createRevenueCatReadApi({ apiKey: config.apiKey, projectId: config.projectId }),
    store: supabaseReconcileStore(admin),
    provider: supabaseProviderStateStore(admin, config.projectId),
    environment: config.environment,
  });
}
