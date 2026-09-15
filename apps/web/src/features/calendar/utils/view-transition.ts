import { getZonedParts, zonedWallClockToUtc } from '@cal/domain';

import type { CalendarViewMode } from './calendar-window';
import { dateKeyToInstant } from './calendar-window';

export type ViewTransitionDirection = 'in' | 'out';

export interface ViewTransitionOrigin {
  x: number;
  y: number;
}

export interface ViewTransitionState {
  direction: ViewTransitionDirection;
  origin: ViewTransitionOrigin;
}

const MODE_HIERARCHY: Record<CalendarViewMode, number> = {
  day: 0,
  week: 1,
  month: 2,
};

/**
 * Determines whether switching from one view mode to another is zooming "in"
 * (towards a more granular view) or "out" (towards a broader view).
 */
export function getViewTransitionDirection(
  fromMode: CalendarViewMode,
  toMode: CalendarViewMode,
): ViewTransitionDirection | null {
  if (fromMode === toMode) return null;
  return MODE_HIERARCHY[toMode] < MODE_HIERARCHY[fromMode] ? 'in' : 'out';
}

export interface TransitionOriginOptions {
  fromMode: CalendarViewMode;
  toMode: CalendarViewMode;
  selectedDateKey: string;
  timeZone: string;
  weekStartsOn?: number;
  dateKeys?: readonly string[];
}

/**
 * Computes the spatial transform-origin { x, y } percentage based on where
 * the selected date is positioned in the calendar grid.
 *
 * For Month transitions, both x (column 0..6) and y (row 0..5) are anchored.
 * For Week <-> Day transitions, x is anchored to the day column and y is centered (50%).
 */
export function getTransitionOrigin({
  fromMode,
  toMode,
  selectedDateKey,
  timeZone,
  weekStartsOn = 0,
  dateKeys,
}: TransitionOriginOptions): ViewTransitionOrigin {
  if (fromMode === toMode) {
    return { x: 50, y: 50 };
  }

  // 1. Calculate column index (0 to 6)
  // Only use dateKeys when it provides valid multi-column geometry matching fromMode:
  // - fromMode === 'week' with 7 dateKeys
  // - fromMode === 'month' with 42 dateKeys
  // When fromMode is 'day', dateKeys contains only 1 date (or no grid geometry)
  // and cannot represent week columns, so derive weekday relative to weekStartsOn.
  let colIndex: number;
  if (
    dateKeys &&
    ((fromMode === 'week' && dateKeys.length === 7) ||
      (fromMode === 'month' && dateKeys.length === 42))
  ) {
    const idx = dateKeys.indexOf(selectedDateKey);
    if (idx >= 0) {
      colIndex = idx % 7;
    } else {
      const anchor = dateKeyToInstant(selectedDateKey, timeZone);
      const weekday = getZonedParts(anchor, timeZone).weekday;
      colIndex = (weekday - weekStartsOn + 7) % 7;
    }
  } else {
    const anchor = dateKeyToInstant(selectedDateKey, timeZone);
    const weekday = getZonedParts(anchor, timeZone).weekday;
    colIndex = (weekday - weekStartsOn + 7) % 7;
  }

  const x = Math.round(((colIndex + 0.5) / 7) * 10000) / 100;

  // 2. Calculate vertical position (y)
  if (fromMode === 'month' || toMode === 'month') {
    let rowIndex = 2;
    if (fromMode === 'month' && dateKeys && dateKeys.length === 42) {
      const idx = dateKeys.indexOf(selectedDateKey);
      if (idx >= 0) {
        rowIndex = Math.min(5, Math.max(0, Math.floor(idx / 7)));
      }
    } else {
      const [year = 1970, month = 1, day = 1] = selectedDateKey.split('-').map(Number);
      const firstOfMonth = zonedWallClockToUtc({ year, month, day: 1 }, timeZone);
      const firstWeekday = getZonedParts(firstOfMonth, timeZone).weekday;
      const daysBefore = (firstWeekday - weekStartsOn + 7) % 7;
      const gridIdx = daysBefore + (day - 1);
      rowIndex = Math.min(5, Math.max(0, Math.floor(gridIdx / 7)));
    }
    const y = Math.round(((rowIndex + 0.5) / 6) * 10000) / 100;
    return { x, y };
  }

  return { x, y: 50 };
}
