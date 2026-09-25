import { minuteOfDay, toZonedDateKey } from '@cal/domain';

import type { EventOccurrence } from './calendar-occurrences';

/** Hours of context shown above a revealed event. */
const REVEAL_LEAD_HOURS = 1;
/** Hours of context shown above the current time. */
const NOW_LEAD_HOURS = 2;
/** Where a timeline that does not contain today starts. */
const DEFAULT_START_HOUR = 7;

export interface InitialScrollInput {
  dateKeys: readonly string[];
  byDateKey: ReadonlyMap<string, readonly EventOccurrence[]>;
  /** Event the calendar was opened for (for example from Today); it must be on screen. */
  revealEventId: string | null;
  todayKey: string | null;
  now: Date;
  timeZone: string;
}

/**
 * The hour a timeline first scrolls to: a linked event if there is one, otherwise shortly
 * before now on today, otherwise the start of a typical working day.
 */
export function initialScrollHour({
  dateKeys,
  byDateKey,
  revealEventId,
  todayKey,
  now,
  timeZone,
}: InitialScrollInput): number {
  if (revealEventId) {
    const occurrence = dateKeys
      .flatMap((dateKey) => byDateKey.get(dateKey) ?? [])
      .find((item) => item.event.id === revealEventId && !item.event.allDay);
    if (occurrence) {
      const start = new Date(occurrence.start);
      // An event that began before the visible days is drawn from the top of the first day.
      const startMinute = dateKeys.includes(toZonedDateKey(start, timeZone))
        ? minuteOfDay(start, timeZone)
        : 0;
      return Math.max(0, startMinute / 60 - REVEAL_LEAD_HOURS);
    }
  }
  if (todayKey && dateKeys.includes(todayKey)) {
    return Math.max(0, minuteOfDay(now, timeZone) / 60 - NOW_LEAD_HOURS);
  }
  return DEFAULT_START_HOUR;
}
