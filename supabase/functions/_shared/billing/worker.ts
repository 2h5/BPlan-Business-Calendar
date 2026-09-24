import type { SupabaseClient } from '@supabase/supabase-js';

import { RECONCILE_LEASE_SECONDS, type ReconcileOutcome, type Reconciler } from './reconciler.ts';

/**
 * One scheduled reconciliation cycle: queue the users most likely to be wrong,
 * then drain a bounded batch within a time budget. Each user is processed
 * under a lease, so overlapping cycles cannot apply two snapshots for the
 * same user, and a crashed cycle's work becomes claimable again when its
 * lease expires.
 */

export interface ReconcileQueue {
  sweep(limit: number): Promise<number>;
  claim(limit: number, leaseSeconds: number): Promise<{ userId: string; leaseToken: string }[]>;
  release(
    userId: string,
    leaseToken: string,
    code: string,
    retryAfterSeconds: number | null,
  ): Promise<void>;
}

export interface CycleSummary {
  swept: number;
  claimed: number;
  outcomes: Partial<Record<ReconcileOutcome | 'DEADLINE' | 'ERROR', number>>;
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
  const claims = await deps.queue.claim(deps.batchSize, RECONCILE_LEASE_SECONDS);
  const outcomes: CycleSummary['outcomes'] = {};
  const count = (key: keyof CycleSummary['outcomes']) => {
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  };

  for (const claim of claims) {
    if (now() >= deadline) {
      // Hand the lease back immediately rather than let it block the user.
      await deps.queue
        .release(claim.userId, claim.leaseToken, 'DEADLINE', 0)
        .catch(() => undefined);
      count('DEADLINE');
      continue;
    }
    try {
      count(await deps.reconciler.reconcile(claim.userId, claim.leaseToken));
    } catch {
      // A database failure mid-apply rolled back; the lease expires and the
      // user is claimed again by a later cycle.
      count('ERROR');
    }
  }

  return { swept, claimed: claims.length, outcomes };
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
