import type { WorkingHours } from '@cal/schemas';

import { MINUTES_PER_DAY, type MinuteInterval } from './event-resize';

/** 0 = Sunday … 6 = Saturday for a `YYYY-MM-DD` wall-clock date key. */
function weekdayOfDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

/**
 * The wall-clock minute ranges of a day that fall outside the user's working
 * hours, for shading the timeline. Returns nothing when working hours are not
 * configured at all, so an unconfigured profile is not shaded as "always off".
 */
export function offHoursBands(dateKey: string, workingHours: WorkingHours): MinuteInterval[] {
  if (workingHours.length === 0) return [];

  const weekday = weekdayOfDateKey(dateKey);
  const windows = workingHours
    .filter((w) => w.weekday === weekday && w.endMinute > w.startMinute)
    .map((w) => ({
      startMinute: Math.max(0, w.startMinute),
      endMinute: Math.min(MINUTES_PER_DAY, w.endMinute),
    }))
    .sort((a, b) => a.startMinute - b.startMinute);

  const bands: MinuteInterval[] = [];
  let cursor = 0;
  for (const window of windows) {
    if (window.startMinute > cursor) {
      bands.push({ startMinute: cursor, endMinute: window.startMinute });
    }
    cursor = Math.max(cursor, window.endMinute);
  }
  if (cursor < MINUTES_PER_DAY) bands.push({ startMinute: cursor, endMinute: MINUTES_PER_DAY });
  return bands;
}
