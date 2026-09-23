import { queryKeys } from '../../../lib/query/query-client';
import { usePullToRefresh } from '../../../lib/query/usePullToRefresh';

const AGENDA_KEYS = [queryKeys.events.all(), queryKeys.calendars.all()] as const;

/** The events on screen and the calendars that colour them, refetched on a pull. */
export function useAgendaRefresh() {
  return usePullToRefresh(AGENDA_KEYS);
}
