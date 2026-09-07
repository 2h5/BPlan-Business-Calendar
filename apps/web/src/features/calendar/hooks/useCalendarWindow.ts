import type { Calendar, HourCycle } from '@cal/schemas';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchCalendarProfile, fetchCalendars, fetchEventsInWindow } from '../api/calendar.api';
import { buildCalendarOccurrences, type EventOccurrence } from '../utils/calendar-occurrences';
import {
  type CalendarViewMode,
  type CalendarWindow,
  windowForView,
} from '../utils/calendar-window';

export type { EventOccurrence } from '../utils/calendar-occurrences';

interface CalendarWindowResult {
  window: CalendarWindow;
  occurrences: EventOccurrence[];
  byDateKey: Map<string, EventOccurrence[]>;
  calendars: Calendar[];
  timeZone: string;
  weekStartsOn: number;
  hourCycle: HourCycle;
  defaultEventMinutes: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useCalendarWindow(
  mode: CalendarViewMode,
  selectedDateKey: string,
): CalendarWindowResult {
  const { isAuthenticated } = useAuth();
  const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const profileQuery = useQuery({
    queryKey: queryKeys.profile(),
    queryFn: fetchCalendarProfile,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const timeZone = profileQuery.data?.timezone ?? deviceTimeZone;
  const weekStartsOn = profileQuery.data?.weekStartsOn ?? 1;
  const hourCycle = profileQuery.data?.hourCycle ?? 'h12';

  const window = useMemo(
    () => windowForView(mode, selectedDateKey, timeZone, weekStartsOn),
    [mode, selectedDateKey, timeZone, weekStartsOn],
  );
  const startIso = window.start.toISOString();
  const endIso = window.end.toISOString();

  const calendarsQuery = useQuery({
    queryKey: queryKeys.calendars.all(),
    queryFn: fetchCalendars,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const eventsQuery = useQuery({
    queryKey: queryKeys.events.window(startIso, endIso),
    queryFn: () => fetchEventsInWindow(new Date(startIso), new Date(endIso)),
    enabled: isAuthenticated,
    placeholderData: (previous) => previous,
  });

  const { occurrences, byDateKey } = useMemo(
    () =>
      buildCalendarOccurrences(
        eventsQuery.data ?? [],
        calendarsQuery.data ?? [],
        window,
        timeZone,
        {},
      ),
    [calendarsQuery.data, eventsQuery.data, timeZone, window],
  );

  return {
    window,
    occurrences,
    byDateKey,
    calendars: calendarsQuery.data ?? [],
    timeZone,
    weekStartsOn,
    hourCycle,
    defaultEventMinutes: profileQuery.data?.defaultEventMinutes ?? 60,
    isLoading: profileQuery.isLoading || calendarsQuery.isLoading || eventsQuery.isLoading,
    isFetching: eventsQuery.isFetching,
    isError: profileQuery.isError || calendarsQuery.isError || eventsQuery.isError,
    refetch: () => {
      void profileQuery.refetch();
      void calendarsQuery.refetch();
      void eventsQuery.refetch();
    },
  };
}
