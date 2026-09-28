import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchCalendarProfile } from '../api/calendar.api';

/** Matches `profiles.week_starts_on`'s default: Sunday. */
export const DEFAULT_WEEK_STARTS_ON = 0;

/** The profile fields the calendar reads, shared through one cached query. */
export function useCalendarProfile() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: fetchCalendarProfile,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}
