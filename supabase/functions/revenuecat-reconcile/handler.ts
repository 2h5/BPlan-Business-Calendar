import { constantTimeEqual } from '../_shared/billing/constant-time.ts';
import type { ReconcileConfigResult, Reconciler } from '../_shared/billing/reconciler.ts';
import { runReconcileCycle, type ReconcileQueue } from '../_shared/billing/worker.ts';

/**
 * Scheduled RevenueCat reconciliation (pg_cron every five minutes).
 *
 * Authenticated by a shared secret rather than a user JWT, like sync-cron.
 * Without the secret, or without a read-only RevenueCat key, project ID, and
 * enforced environment, it refuses to run: queued requests simply wait.
 */

export const CRON_SECRET_HEADER = 'X-Billing-Cron-Secret';
const BATCH_SIZE = 25;
// Edge Functions have a wall-clock limit; stay well inside it.
const BUDGET_MS = 40_000;

export interface ReconcileHandlerDeps {
  cronSecret: string | undefined;
  config: ReconcileConfigResult;
  queue: () => ReconcileQueue;
  reconciler: () => Reconciler;
}

export async function handleReconcileCron(
  request: Request,
  deps: ReconcileHandlerDeps,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
  if (!deps.cronSecret) {
    console.error(JSON.stringify({ code: 'BILLING_CRON_SECRET_MISSING' }));
    return json(503, { error: 'NOT_CONFIGURED' });
  }
  const supplied = request.headers.get(CRON_SECRET_HEADER);
  if (!supplied || !constantTimeEqual(supplied, deps.cronSecret)) {
    return json(403, { error: 'NOT_AUTHORIZED' });
  }
  if (!deps.config.ok) {
    console.error(
      JSON.stringify({ code: 'REVENUECAT_RECONCILE_NOT_CONFIGURED', missing: deps.config.missing }),
    );
    return json(503, { error: 'NOT_CONFIGURED' });
  }

  try {
    const summary = await runReconcileCycle({
      queue: deps.queue(),
      reconciler: deps.reconciler(),
      batchSize: BATCH_SIZE,
      budgetMs: BUDGET_MS,
    });
    console.log(JSON.stringify({ event: 'revenuecat_reconcile_cycle', ...summary }));
    return json(200, summary);
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'REVENUECAT_RECONCILE_FAILED',
        reason: error instanceof Error ? error.name : 'UNKNOWN',
      }),
    );
    return json(500, { error: 'UNKNOWN' });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
