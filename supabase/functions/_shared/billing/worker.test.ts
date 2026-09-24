import { assertEquals } from 'jsr:@std/assert@1';

import type { Reconciler } from './reconciler.ts';
import { runReconcileCycle, type ReconcileQueue } from './worker.ts';

function queue(claims: number) {
  const released: string[] = [];
  const value: ReconcileQueue = {
    sweep: () => Promise.resolve(3),
    claim: () =>
      Promise.resolve(
        Array.from({ length: claims }, (_, index) => ({
          userId: `u${index}`,
          leaseToken: `l${index}`,
        })),
      ),
    release: (userId, _lease, code) => {
      released.push(`${userId}:${code}`);
      return Promise.resolve();
    },
  };
  return { value, released };
}

Deno.test('a cycle sweeps, then reconciles each claimed user under its lease', async () => {
  const seen: string[] = [];
  const reconciler: Reconciler = {
    reconcile: (userId, lease) => {
      seen.push(`${userId}:${lease}`);
      return Promise.resolve('CONVERGED');
    },
  };
  const { value } = queue(2);
  const summary = await runReconcileCycle({
    queue: value,
    reconciler,
    batchSize: 25,
    budgetMs: 10_000,
  });
  assertEquals(summary, { swept: 3, claimed: 2, outcomes: { CONVERGED: 2 } });
  assertEquals(seen, ['u0:l0', 'u1:l1']);
});

Deno.test('work past the time budget is handed back immediately, not left leased', async () => {
  let clock = 0;
  const reconciler: Reconciler = {
    reconcile: () => {
      clock += 6_000;
      return Promise.resolve('REPAIRED');
    },
  };
  const { value, released } = queue(3);
  const summary = await runReconcileCycle({
    queue: value,
    reconciler,
    batchSize: 25,
    budgetMs: 10_000,
    now: () => clock,
  });
  assertEquals(summary.outcomes, { REPAIRED: 2, DEADLINE: 1 });
  assertEquals(released, ['u2:DEADLINE']);
});

Deno.test('one failed user does not stop the cycle', async () => {
  let calls = 0;
  const reconciler: Reconciler = {
    reconcile: () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error('db')) : Promise.resolve('STALE');
    },
  };
  const { value } = queue(2);
  const summary = await runReconcileCycle({
    queue: value,
    reconciler,
    batchSize: 25,
    budgetMs: 10_000,
  });
  assertEquals(summary.outcomes, { ERROR: 1, STALE: 1 });
});
