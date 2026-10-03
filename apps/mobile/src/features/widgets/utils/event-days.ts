import {
  addZonedDays,
  formatTimeOfDay,
  minuteOfDay,
  resolveEventColor,
  startOfZonedDay,
  toZonedDateKey,
} from '@cal/domain';
import type { Calendar, CalendarEvent } from '@cal/schemas';

import { expandCalendarEvents } from '../../events/utils/expand-calendar-events';
import type { WidgetEvent } from '../schema';

export interface EventDayInput {
  events: readonly CalendarEvent[];
  calendars: readonly Calendar[];
  hiddenCalendarIds: readonly string[];
  window: { start: Date; end: Date };
  timeZone: string;
  hourCycle: 'h12' | 'h23';
  /** Colour for an event whose calendar is unknown, normally the brand accent. */
  fallbackColor: string;
}

/**
 * Expands, filters, and buckets events into local days, in the shape the
 * widget draws. Visibility follows the calendar screen's rules: the per-device
 * hidden list and the calendar's own switch. Cancelled events are left out —
 * a widget has no room for a struck-through row.
 */
export function widgetEventsByDay(input: EventDayInput): Map<string, WidgetEvent[]> {
  const { timeZone, hourCycle } = input;
  const calendarById = new Map(input.calendars.map((calendar) => [calendar.id, calendar]));
  const hidden = new Set(input.hiddenCalendarIds);
  const byDay = new Map<string, WidgetEvent[]>();

  const occurrences = expandCalendarEvents(input.events, input.window)
    .filter((item) => {
      const calendar = calendarById.get(item.event.calendarId);
      return (
        !hidden.has(item.event.calendarId) &&
        calendar?.isVisible !== false &&
        item.event.status !== 'cancelled'
      );
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  for (const item of occurrences) {
    const calendar = calendarById.get(item.event.calendarId);
    const event: Omit<WidgetEvent, 'startMinute' | 'endMinute'> = {
      id: `${item.event.id}:${item.occurrenceIndex}`,
      title: item.event.title,
      start: item.start,
      end: item.end,
      allDay: item.event.allDay,
      startLabel: item.event.allDay
        ? ''
        : formatTimeOfDay(new Date(item.start), timeZone, hourCycle),
      endLabel: item.event.allDay ? '' : formatTimeOfDay(new Date(item.end), timeZone, hourCycle),
      color: resolveEventColor(item.event.color, calendar?.color, input.fallbackColor),
      location: item.event.location,
    };

    // An event crossing midnight belongs to every day it touches. `end` is
    // exclusive, so one finishing exactly at midnight stays on its own day.
    const lastKey = toZonedDateKey(new Date(Math.max(item.start, item.end - 1)), timeZone);
    let cursor = startOfZonedDay(new Date(item.start), timeZone);
    let dateKey = toZonedDateKey(cursor, timeZone);
    const firstKey = dateKey;

    for (let guard = 0; guard < 400; guard += 1) {
      const dayEvent: WidgetEvent = {
        ...event,
        ...minutesWithinDay(item, dateKey === firstKey, dateKey === lastKey, timeZone),
      };
      const list = byDay.get(dateKey);
      if (list) list.push(dayEvent);
      else byDay.set(dateKey, [dayEvent]);
      if (dateKey >= lastKey) break;

      // Step in local days so a DST change cannot skip or repeat one.
      cursor = startOfZonedDay(addZonedDays(cursor, 1, timeZone), timeZone);
      dateKey = toZonedDateKey(cursor, timeZone);
    }
  }

  // All-day banners lead each day, as they do in the app's agenda.
  for (const list of byDay.values()) {
    list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  }

  return byDay;
}

/**
 * Where an occurrence sits within one of its days, in minutes from local
 * midnight. Days it only passes through run 0–1440; an end exactly at
 * midnight is the end of the day before, so it reads as 1440, not 0.
 */
function minutesWithinDay(
  item: { start: number; end: number; event: { allDay: boolean } },
  isFirstDay: boolean,
  isLastDay: boolean,
  timeZone: string,
): { startMinute: number; endMinute: number } {
  if (item.event.allDay) return { startMinute: 0, endMinute: 1440 };

  const startMinute = isFirstDay ? minuteOfDay(new Date(item.start), timeZone) : 0;
  if (item.end <= item.start) return { startMinute, endMinute: startMinute };
  const endMinute = isLastDay ? minuteOfDay(new Date(item.end), timeZone) || 1440 : 1440;
  return { startMinute, endMinute: Math.max(startMinute, endMinute) };
}
