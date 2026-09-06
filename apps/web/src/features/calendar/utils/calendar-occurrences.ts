import {
  addZonedDays,
  expandSchedulingCalendarEvents,
  startOfZonedDay,
  toZonedDateKey,
} from '@cal/domain';
import type { Calendar, CalendarEvent } from '@cal/schemas';

import type { CalendarWindow } from './calendar-window';

export interface EventOccurrence {
  key: string;
  event: CalendarEvent;
  calendar: Calendar | undefined;
  start: number;
  end: number;
  occurrenceIndex: number;
}

export interface CalendarOccurrences {
  occurrences: EventOccurrence[];
  byDateKey: Map<string, EventOccurrence[]>;
}

/** Expand recurrence once, apply view visibility, then bucket every occurrence by local day. */
export function buildCalendarOccurrences(
  events: readonly CalendarEvent[],
  calendars: readonly Calendar[],
  window: CalendarWindow,
  timeZone: string,
  visibilityOverrides: Readonly<Record<string, boolean>>,
): CalendarOccurrences {
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const occurrences: EventOccurrence[] = [];

  for (const item of expandSchedulingCalendarEvents(events, window)) {
    const calendar = calendarById.get(item.event.calendarId);
    const isVisible = visibilityOverrides[item.event.calendarId] ?? calendar?.isVisible ?? true;
    if (!isVisible) continue;
    occurrences.push({
      key: `${item.event.id}:${item.occurrenceIndex}:${item.start}`,
      event: item.event,
      calendar,
      start: item.start,
      end: item.end,
      occurrenceIndex: item.occurrenceIndex,
    });
  }

  const byDateKey = new Map(window.dateKeys.map((key) => [key, [] as EventOccurrence[]]));
  for (const occurrence of occurrences) {
    const lastInstant = new Date(Math.max(occurrence.start, occurrence.end - 1));
    const lastKey = toZonedDateKey(lastInstant, timeZone);
    let cursor = startOfZonedDay(new Date(occurrence.start), timeZone);
    let key = toZonedDateKey(cursor, timeZone);

    for (let guard = 0; guard < 400; guard += 1) {
      byDateKey.get(key)?.push(occurrence);
      if (key >= lastKey) break;
      cursor = startOfZonedDay(addZonedDays(cursor, 1, timeZone), timeZone);
      key = toZonedDateKey(cursor, timeZone);
    }
  }

  return { occurrences, byDateKey };
}
