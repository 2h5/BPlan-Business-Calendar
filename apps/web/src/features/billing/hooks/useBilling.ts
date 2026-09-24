import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchSubscription, requestAccessRefresh } from '../api/billing.api';

export function useSubscription() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: queryKeys.subscription(userId),
    queryFn: () => {
      if (!userId) throw new Error('Expected an authenticated user');
      return fetchSubscription(userId);
    },
    enabled: userId !== null,
  });
}

/**
 * Server-side re-read of the user's RevenueCat entitlement, then a fresh read
 * of the mirror. The mirror is re-read even if the refresh call fails, so the
 * button never does less than a plain refetch.
 */
export function useRefreshAccess() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: requestAccessRefresh,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscription(userId) }),
  });
}
