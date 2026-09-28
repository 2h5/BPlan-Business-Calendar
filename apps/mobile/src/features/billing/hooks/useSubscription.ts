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
  /** True until the first answer arrives, so nothing is decided too early. */
  isLoading: boolean;
  /** The entitlement could not be read and there is no earlier answer to show. */
  isUnavailable: boolean;
  retry: () => void;
}

/** What plan the account is on, read the same way the web reads it. */
export function usePlanState(): PlanState {
  const { data, isPending, isError, isFetching, refetch } = useSubscription();
  const info = getSubscriptionStatusInfo(data ?? null);

  return {
    info,
    isPro: info.state === 'active',
    isLoading: isPending && !isError,
    // An error is not proof of anything, so it must not read as the free plan
    // and tell someone who pays for Pro to upgrade. A failed *refetch* is
    // different: the last answer still stands.
    isUnavailable: isError && data === undefined && !isFetching,
    retry: () => void refetch(),
  };
}
