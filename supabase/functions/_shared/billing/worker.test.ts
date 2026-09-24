import { assertEquals } from 'jsr:@std/assert@1';

import type { ProviderAccess } from './provider-state.ts';
import type { ReconcileResult, Reconciler } from './reconciler.ts';
import { runReconcileCycle, type ReconcileQueue } from './worker.ts';

const READY: ProviderAccess = { ok: true, catalog: [{ id: 'entl_pro', lookup_key: 'pro' }] };

function queue(claims: number) {
  const released: string[] = [];
  let claimCalls = 0;
  const value: ReconcileQueue = {
    sweep: () => Promise.resolve(3),
    claim: () => {
      claimCalls += 1;
      return Promise.resolve(
        Array.from({ length: claims }, (_, index) => ({
          userId: `u${index}`,
          leaseToken: `l${index}`,
        })),
      );
    },
    release: (userId, _lease, code, retryAfter, countAttempt) => {
      released.push(`${userId}:${code}:${retryAfter}:${countAttempt ? 'counted' : 'uncounted'}`);
      return Promise.resolve();
    },
  };
  return { value, released, claimCalls: () => claimCalls };
}

function reconciler(
  reconcile: Reconciler['reconcile'],
  prepare: () => Promise<ProviderAccess> = () => Promise.resolve(READY),
): Reconciler {
  return { prepare, reconcile };
}

const result = (
  outcome: ReconcileResult['outcome'],
  retryAfterSeconds: number | null = null,
): Promise<ReconcileResult> => Promise.resolve({ outcome, retryAfterSeconds });

Deno.test('a cycle sweeps, then reconciles each claimed user under its lease', async () => {
  const seen: string[] = [];
  const { value } = queue(2);
  const summary = await runReconcileCycle({
    queue: value,
    reconciler: reconciler((userId, lease) => {
      seen.push(`${userId}:${lease}`);
      return result('CONVERGED');
    }),
    batchSize: 25,
    budgetMs: 10_000,
  });
  assertEquals(summary, { swept: 3, claimed: 2, outcomes: { CONVERGED: 2 } });
  assertEquals(seen, ['u0:l0', 'u1:l1']);
});

Deno.test('an unavailable catalog or provider backoff claims nobody', async () => {
  const { value, claimCalls } = queue(3);
  let reconciled = 0;
  const summary = await runReconcileCycle({
    queue: value,
    reconciler: reconciler(
      () => {
        reconciled += 1;
        return result('CONVERGED');
      },
      () => Promise.resolve({ ok: false, code: 'PROVIDER_BACKOFF', retryAfterSeconds: 300 }),
    ),
    batchSize: 25,
    budgetMs: 10_000,
  });
  assertEquals(summary, {
    swept: 3,
    claimed: 0,
    outcomes: {},
    backoff: { code: 'PROVIDER_BACKOFF', retryAfterSeconds: 300 },
  });
  assertEquals(claimCalls(), 0);
  assertEquals(reconciled, 0);
});

Deno.test('a project-wide failure mid-cycle hands the rest back unread and uncounted', async () => {
  const { value, released } = queue(4);
  let calls = 0;
  const summary = await runReconcileCycle({
    queue: value,
    reconciler: reconciler(() => {
      calls += 1;
      return calls === 1 ? result('REPAIRED') : result('BACKING_OFF', 90);
    }),
    batchSize: 25,
    budgetMs: 10_000,
  });
  assertEquals(calls, 2);
  assertEquals(summary.outcomes, { REPAIRED: 1, BACKING_OFF: 3 });
  assertEquals(summary.backoff, { code: 'PROVIDER_BACKOFF', retryAfterSeconds: 90 });
  assertEquals(released, ['u2:PROVIDER_BACKOFF:90:uncounted', 'u3:PROVIDER_BACKOFF:90:uncounted']);
});

Deno.test('work past the time budget is handed back immediately and not counted', async () => {
  let clock = 0;
  const { value, released } = queue(3);
  const summary = await runReconcileCycle({
    queue: value,
    reconciler: reconciler(() => {
      clock += 6_000;
      return result('REPAIRED');
    }),
    batchSize: 25,
    budgetMs: 10_000,
    now: () => clock,
  });
  assertEquals(summary.outcomes, { REPAIRED: 2, DEADLINE: 1 });
  assertEquals(released, ['u2:DEADLINE:0:uncounted']);
});

Deno.test('one failed user does not stop the cycle', async () => {
  let calls = 0;
  const { value } = queue(2);
  const summary = await runReconcileCycle({
    queue: value,
    reconciler: reconciler(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('db')) : result('STALE');
    }),
    batchSize: 25,
    budgetMs: 10_000,
  });
  assertEquals(summary.outcomes, { ERROR: 1, STALE: 1 });
});
