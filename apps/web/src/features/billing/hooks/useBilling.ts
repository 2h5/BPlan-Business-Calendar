import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchSubscription } from '../api/billing.api';

export function useSubscription() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: fetchSubscription,
    enabled: isAuthenticated,
  });
}
