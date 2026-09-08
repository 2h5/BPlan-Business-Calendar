import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { searchEverything } from '../api/search.api';

export function useSearch(query: string) {
  const { isAuthenticated } = useAuth();
  const normalized = query.trim();
  return useQuery({
    queryKey: queryKeys.search(normalized),
    queryFn: () => searchEverything(normalized),
    enabled: isAuthenticated && normalized.length >= 2,
  });
}
