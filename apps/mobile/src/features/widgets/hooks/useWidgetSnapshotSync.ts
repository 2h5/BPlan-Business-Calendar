import { useTheme } from '@cal/ui';
import { useEffect, useMemo } from 'react';

import { useForegroundDay } from './useForegroundDay';
import { logError } from '../../../lib/logger';
import { useCalendarViewStore } from '../../../store/calendar-view.store';
import { useAuth } from '../../auth';
import { dateKeyToInstant } from '../../calendar/utils/window';
import { useCalendars } from '../../events/hooks/useCalendars';
import { useEventsInWindow } from '../../events/hooks/useEvents';
import { useProfile, useUserTimeZone } from '../../settings/hooks/useProfile';
import { useTasks } from '../../tasks/hooks/useTasks';
import { clearWidgetSnapshot, writeWidgetSnapshot } from '../api/widget-storage';
import { buildWidgetSnapshot, widgetEventWindow } from '../utils/build-snapshot';

/** Coalesces a burst of cache updates — a sync landing, say — into one write. */
const WRITE_DELAY_MS = 600;

/**
 * Keeps the Home Screen widget's snapshot in step with the app's server state.
 *
 * It reads the same TanStack Query collections the screens use, so an edit
 * anywhere in the app reaches the widget as soon as the cache updates. Signing
 * out clears the snapshot.
 */
export function useWidgetSnapshotSync(): void {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const theme = useTheme();
  const timeZone = useUserTimeZone();
  const { data: profile } = useProfile();
  const weekStartsOn = profile?.weekStartsOn ?? 0;
  const hourCycle = profile?.hourCycle ?? 'h23';
  const hiddenCalendarIds = useCalendarViewStore((state) => state.hiddenCalendarIds);

  const dayKey = useForegroundDay(timeZone);
  const window = useMemo(
    () => widgetEventWindow(dateKeyToInstant(dayKey, timeZone), timeZone, weekStartsOn),
    [dayKey, timeZone, weekStartsOn],
  );

  const { data: events } = useEventsInWindow(window.start, window.end);
  const { data: calendars } = useCalendars();
  const { data: tasks } = useTasks();

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      clearWidgetSnapshot();
      return;
    }
    if (!events || !calendars || !tasks || !profile) return;

    const timer = setTimeout(() => {
      try {
        writeWidgetSnapshot(
          buildWidgetSnapshot({
            now: new Date(),
            timeZone,
            weekStartsOn,
            hourCycle,
            events,
            calendars,
            hiddenCalendarIds,
            tasks,
            fallbackColor: theme.colors.accent,
          }),
        );
      } catch (error) {
        logError(error);
      }
    }, WRITE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    authLoading,
    isAuthenticated,
    events,
    calendars,
    tasks,
    profile,
    timeZone,
    weekStartsOn,
    hourCycle,
    hiddenCalendarIds,
    theme.colors.accent,
    dayKey,
  ]);
}
