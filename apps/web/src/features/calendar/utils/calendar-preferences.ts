import { useCallback, useState } from 'react';

import type { CalendarViewMode } from './calendar-window';

export const CALENDAR_VIEW_STORAGE_KEY = 'bplan_default_calendar_view';

export const VALID_CALENDAR_VIEWS: readonly CalendarViewMode[] = ['day', 'week', 'month'] as const;

export function isValidCalendarViewMode(value: unknown): value is CalendarViewMode {
  return value === 'day' || value === 'week' || value === 'month';
}

export function getDefaultCalendarView(): CalendarViewMode {
  if (typeof window === 'undefined') return 'month';
  try {
    const stored = localStorage.getItem(CALENDAR_VIEW_STORAGE_KEY);
    if (isValidCalendarViewMode(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable or restricted
  }
  return 'month';
}

export function setDefaultCalendarView(mode: CalendarViewMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable or restricted
  }
}

export function useCalendarViewPreference() {
  const [defaultView, setDefaultViewState] = useState<CalendarViewMode>(getDefaultCalendarView);

  const setDefaultView = useCallback((mode: CalendarViewMode) => {
    setDefaultViewState(mode);
    setDefaultCalendarView(mode);
  }, []);

  return [defaultView, setDefaultView] as const;
}
