import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchCalendars } from '../api/calendar.api';

export function useCalendars() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.calendars.all(),
    queryFn: fetchCalendars,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
