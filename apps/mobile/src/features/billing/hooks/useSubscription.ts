import { getSubscriptionStatusInfo, type SubscriptionStatusInfo } from '@cal/domain';
import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchSubscription } from '../api/billing.api';

export function useSubscription() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: () => {
      if (!userId) throw new Error('Expected an authenticated user');
      return fetchSubscription(userId);
    },
    enabled: userId !== null,
    // Entitlement changes arrive by webhook, not by anything the app does.
    staleTime: 5 * 60_000,
  });
}

export interface PlanState {
  info: SubscriptionStatusInfo;
  /** Full access. Anything else — free, paused, expired — is not Pro. */
  isPro: boolean;
  /** True until the entitlement is known, so nothing is decided too early. */
  isLoading: boolean;
}

/** What plan the account is on, read the same way the web reads it. */
export function usePlanState(): PlanState {
  const { data, isPending, isError } = useSubscription();
  const info = getSubscriptionStatusInfo(data ?? null);

  return {
    info,
    isPro: info.state === 'active',
    // An error is not proof of anything, so treat it as still unknown rather
    // than telling someone who pays for Pro to upgrade. A failed *refetch* is
    // different: the last answer still stands, so the card should not vanish
    // because someone pressed refresh without signal.
    isLoading: isPending || (isError && data === undefined),
  };
}
