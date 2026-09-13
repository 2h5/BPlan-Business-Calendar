import { useCallback, useState } from 'react';

import type { CalendarViewMode } from './calendar-window';

export const CALENDAR_VIEW_STORAGE_KEY = 'bplan_default_calendar_view';
export const LAST_CALENDAR_VIEW_STORAGE_KEY = 'bplan_last_calendar_view';

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

let inMemoryLastView: CalendarViewMode | null = null;

export function getLastCalendarView(): CalendarViewMode | null {
  if (inMemoryLastView && isValidCalendarViewMode(inMemoryLastView)) {
    return inMemoryLastView;
  }
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(LAST_CALENDAR_VIEW_STORAGE_KEY);
    if (isValidCalendarViewMode(stored)) {
      inMemoryLastView = stored;
      return stored;
    }
  } catch {
    // sessionStorage unavailable or restricted
  }
  return null;
}

export function setLastCalendarView(mode: CalendarViewMode): void {
  inMemoryLastView = mode;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(LAST_CALENDAR_VIEW_STORAGE_KEY, mode);
  } catch {
    // sessionStorage unavailable or restricted
  }
}

export function clearLastCalendarView(): void {
  inMemoryLastView = null;
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(LAST_CALENDAR_VIEW_STORAGE_KEY);
  } catch {
    // sessionStorage unavailable or restricted
  }
}

export function getActiveCalendarView(): CalendarViewMode {
  return getLastCalendarView() ?? getDefaultCalendarView();
}

export function useCalendarViewPreference() {
  const [defaultView, setDefaultViewState] = useState<CalendarViewMode>(getDefaultCalendarView);

  const setDefaultView = useCallback((mode: CalendarViewMode) => {
    setDefaultViewState(mode);
    setDefaultCalendarView(mode);
    clearLastCalendarView();
  }, []);

  return [defaultView, setDefaultView] as const;
}
