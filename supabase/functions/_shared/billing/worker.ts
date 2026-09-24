import type { SupabaseClient } from '@supabase/supabase-js';

import {
  RECONCILE_LEASE_SECONDS,
  releaseReconciliation,
  type ReconcileOutcome,
  type Reconciler,
} from './reconciler.ts';

/**
 * One scheduled reconciliation cycle: queue the users most likely to be wrong,
 * then drain a bounded batch within a time budget. Each user is processed
 * under a lease, so overlapping cycles cannot apply two snapshots for the
 * same user, and a crashed cycle's work becomes claimable again when its
 * lease expires.
 *
 * Project-wide readiness is resolved before anything is claimed: while the
 * catalog is unavailable or RevenueCat is backing off, nothing is claimed and
 * no user's backoff grows. If a project-wide failure happens mid-cycle, the
 * remaining claims are handed back unread.
 */

export interface ReconcileQueue {
  sweep(limit: number): Promise<number>;
  claim(limit: number, leaseSeconds: number): Promise<{ userId: string; leaseToken: string }[]>;
  release(
    userId: string,
    leaseToken: string,
    code: string,
    retryAfterSeconds: number | null,
    countAttempt: boolean,
  ): Promise<void>;
}

export interface CycleSummary {
  swept: number;
  claimed: number;
  outcomes: Partial<Record<ReconcileOutcome | 'DEADLINE' | 'ERROR', number>>;
  /** Present when project-wide state stopped the cycle from reading RevenueCat. */
  backoff?: { code: string; retryAfterSeconds: number };
}

export async function runReconcileCycle(deps: {
  queue: ReconcileQueue;
  reconciler: Reconciler;
  batchSize: number;
  budgetMs: number;
  now?: () => number;
}): Promise<CycleSummary> {
  const now = deps.now ?? Date.now;
  const deadline = now() + deps.budgetMs;
  const swept = await deps.queue.sweep(200);

  const ready = await deps.reconciler.prepare();
  if (!ready.ok) {
    return {
      swept,
      claimed: 0,
      outcomes: {},
      backoff: { code: ready.code, retryAfterSeconds: ready.retryAfterSeconds },
    };
  }

  const claims = await deps.queue.claim(deps.batchSize, RECONCILE_LEASE_SECONDS);
  const outcomes: CycleSummary['outcomes'] = {};
  const count = (key: keyof CycleSummary['outcomes']) => {
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  };
  let backoff: CycleSummary['backoff'];

  for (const claim of claims) {
    if (backoff !== undefined) {
      await deps.queue
        .release(
          claim.userId,
          claim.leaseToken,
          'PROVIDER_BACKOFF',
          backoff.retryAfterSeconds,
          false,
        )
        .catch(() => undefined);
      count('BACKING_OFF');
      continue;
    }
    if (now() >= deadline) {
      // Hand the lease back immediately rather than let it block the user.
      // Running out of time is not the user's failure.
      await deps.queue
        .release(claim.userId, claim.leaseToken, 'DEADLINE', 0, false)
        .catch(() => undefined);
      count('DEADLINE');
      continue;
    }
    try {
      const result = await deps.reconciler.reconcile(claim.userId, claim.leaseToken);
      count(result.outcome);
      if (result.outcome === 'BACKING_OFF') {
        backoff = { code: 'PROVIDER_BACKOFF', retryAfterSeconds: result.retryAfterSeconds ?? 60 };
      }
    } catch {
      // A database failure mid-apply rolled back; the lease expires and the
      // user is claimed again by a later cycle.
      count('ERROR');
    }
  }

  return { swept, claimed: claims.length, outcomes, ...(backoff ? { backoff } : {}) };
}

export function supabaseReconcileQueue(admin: SupabaseClient): ReconcileQueue {
  return {
    async sweep(limit) {
      const { data, error } = await admin.rpc('enqueue_revenuecat_reconciliation_sweep', {
        p_limit: limit,
      });
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
    async claim(limit, leaseSeconds) {
      const { data, error } = await admin.rpc('claim_revenuecat_reconciliations', {
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
      return rows.flatMap((row) =>
        typeof row.claimed_user_id === 'string' && typeof row.claimed_lease_token === 'string'
          ? [{ userId: row.claimed_user_id, leaseToken: row.claimed_lease_token }]
          : [],
      );
    },
    release: (userId, leaseToken, code, retryAfterSeconds, countAttempt) =>
      releaseReconciliation(admin, userId, leaseToken, code, retryAfterSeconds, countAttempt),
  };
}
