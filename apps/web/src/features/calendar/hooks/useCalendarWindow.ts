import type { Calendar, HourCycle, WorkingHours } from '@cal/schemas';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useCalendarProfile } from './useCalendarProfile';
import { useCalendars } from './useCalendars';
import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchEventsInWindow } from '../api/calendar.api';
import { buildCalendarOccurrences, type EventOccurrence } from '../utils/calendar-occurrences';
import {
  DEFAULT_WEEK_STARTS_ON,
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
  workingHours: WorkingHours;
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

  const profileQuery = useCalendarProfile();
  const timeZone = profileQuery.data?.timezone ?? deviceTimeZone;
  const weekStartsOn = profileQuery.data?.weekStartsOn ?? DEFAULT_WEEK_STARTS_ON;
  const hourCycle = profileQuery.data?.hourCycle ?? 'h12';

  const window = useMemo(
    () => windowForView(mode, selectedDateKey, timeZone, weekStartsOn),
    [mode, selectedDateKey, timeZone, weekStartsOn],
  );
  const startIso = window.start.toISOString();
  const endIso = window.end.toISOString();

  const calendarsQuery = useCalendars();
  const eventsQuery = useQuery({
    queryKey: queryKeys.events.window(startIso, endIso),
    queryFn: () => fetchEventsInWindow(new Date(startIso), new Date(endIso)),
    // The window depends on the profile's time zone and week start; wait for
    // them rather than fetching a fallback window first.
    enabled: isAuthenticated && profileQuery.isSuccess,
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
    workingHours: profileQuery.data?.workingHours ?? [],
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
