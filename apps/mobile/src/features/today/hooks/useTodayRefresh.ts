import { queryKeys } from '../../../lib/query/query-client';
import { usePullToRefresh } from '../../../lib/query/usePullToRefresh';

const TODAY_KEYS = [
  queryKeys.profile(),
  queryKeys.tasks.all(),
  queryKeys.calendars.all(),
  queryKeys.events.all(),
] as const;

/** Everything the Today screen summarises, refetched on a pull. */
export function useTodayRefresh() {
  return usePullToRefresh(TODAY_KEYS);
}
