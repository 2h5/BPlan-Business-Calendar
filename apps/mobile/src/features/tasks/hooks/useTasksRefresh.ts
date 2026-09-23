import { queryKeys } from '../../../lib/query/query-client';
import { usePullToRefresh } from '../../../lib/query/usePullToRefresh';

// `tasks.all()` is a prefix of the lists and tags keys, so it covers them too.
const TASKS_KEYS = [queryKeys.tasks.all()] as const;

/** The task list and its lists, refetched on a pull. */
export function useTasksRefresh() {
  return usePullToRefresh(TASKS_KEYS);
}
