import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import {
  RECONCILE_LEASE_SECONDS,
  type ReconcileConfigResult,
  type ReconcileOutcome,
  type Reconciler,
} from '../_shared/billing/reconciler.ts';

/**
 * "Refresh access status" for the signed-in user.
 *
 * Reads the caller's own entitlement from RevenueCat and repairs the mirror
 * through the same lease-fenced snapshot path as the scheduled worker. It is
 * the only convergence path for a user with no mirror row at all, such as a
 * first purchase whose webhook never arrived.
 *
 * The caller can only ever target themselves (the user ID comes from the
 * verified JWT), and the database rate-limits to one snapshot per minute.
 * A result never grants anything the RevenueCat read did not.
 */

export type RefreshStatus = ReconcileOutcome | 'IN_PROGRESS' | 'RECENTLY_VERIFIED';

export interface RefreshClaim {
  status: 'CLAIMED' | 'IN_PROGRESS' | 'RECENTLY_VERIFIED';
  leaseToken: string | null;
}

export interface RefreshDeps {
  requireUser: (request: Request) => Promise<{ id: string }>;
  config: ReconcileConfigResult;
  claim: (userId: string, leaseSeconds: number) => Promise<RefreshClaim>;
  reconciler: () => Reconciler;
}

export function createRefreshHandler(deps: RefreshDeps): (request: Request) => Promise<Response> {
  return withErrorHandling(async (request) => {
    if (request.method === 'OPTIONS') return preflight();
    if (request.method !== 'POST') throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);

    const user = await deps.requireUser(request);
    if (!deps.config.ok) {
      console.error(
        JSON.stringify({
          code: 'REVENUECAT_RECONCILE_NOT_CONFIGURED',
          missing: deps.config.missing,
        }),
      );
      throw new EdgeError('UNKNOWN', 'Access refresh is not available.', 503);
    }

    const claim = await deps.claim(user.id, RECONCILE_LEASE_SECONDS);
    if (claim.status !== 'CLAIMED') {
      const status: RefreshStatus = claim.status;
      return jsonResponse({ status });
    }
    if (claim.leaseToken === null) throw new EdgeError('UNKNOWN', 'Could not refresh access.', 500);

    const status: RefreshStatus = await deps.reconciler().reconcile(user.id, claim.leaseToken);
    return jsonResponse({ status });
  });
}
