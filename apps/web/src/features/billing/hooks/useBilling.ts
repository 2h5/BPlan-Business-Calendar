import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchSubscription } from '../api/billing.api';

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
