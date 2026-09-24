import { adminClient, requireUser } from '../_shared/auth/index.ts';
import { EdgeError } from '../_shared/errors/index.ts';
import { createConfiguredReconciler, readReconcileConfig } from '../_shared/billing/reconciler.ts';
import { createRefreshHandler, type RefreshClaim } from './handler.ts';

const CLAIM_STATUSES: readonly RefreshClaim['status'][] = [
  'CLAIMED',
  'IN_PROGRESS',
  'RECENTLY_VERIFIED',
  'BACKING_OFF',
];

const config = readReconcileConfig((name) => Deno.env.get(name));

Deno.serve(
  createRefreshHandler({
    requireUser,
    config,
    async claim(userId, leaseSeconds) {
      const { data, error } = await adminClient().rpc('claim_revenuecat_user_reconciliation', {
        p_user_id: userId,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new EdgeError('UNKNOWN', 'Could not refresh access.', 500);
      const row = Array.isArray(data)
        ? (data[0] as Record<string, unknown> | undefined)
        : undefined;
      const status = CLAIM_STATUSES.find((value) => value === row?.claim_status);
      if (!status) throw new EdgeError('UNKNOWN', 'Could not refresh access.', 500);
      const leaseToken =
        typeof row?.claimed_lease_token === 'string' ? row.claimed_lease_token : null;
      const retryAfterSeconds =
        typeof row?.retry_after_seconds === 'number' ? row.retry_after_seconds : null;
      return { status, leaseToken, retryAfterSeconds };
    },
    reconciler() {
      if (!config.ok) throw new EdgeError('UNKNOWN', 'Access refresh is not available.', 503);
      return createConfiguredReconciler(adminClient(), config.config);
    },
  }),
);
