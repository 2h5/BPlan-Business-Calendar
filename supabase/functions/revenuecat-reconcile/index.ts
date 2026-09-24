import { adminClient } from '../_shared/auth/index.ts';
import { createConfiguredReconciler, readReconcileConfig } from '../_shared/billing/reconciler.ts';
import { supabaseReconcileQueue } from '../_shared/billing/worker.ts';
import { handleReconcileCron } from './handler.ts';

Deno.serve((request) => {
  const config = readReconcileConfig((name) => Deno.env.get(name));
  return handleReconcileCron(request, {
    cronSecret: Deno.env.get('BILLING_RECONCILE_CRON_SECRET'),
    config,
    queue: () => supabaseReconcileQueue(adminClient()),
    reconciler: () => {
      if (!config.ok) throw new Error('Reconciliation is not configured');
      return createConfiguredReconciler(adminClient(), config.config);
    },
  });
});
