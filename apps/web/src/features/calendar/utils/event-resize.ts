import { getZonedParts, toZonedDateKey, zonedWallClockToUtc } from '@cal/domain';
import type { Calendar, CalendarEvent } from '@cal/schemas';

import { eventWriteRoute } from './event-ownership';

export const RESIZE_SNAP_MINUTES = 15;
export const MIN_RESIZE_DURATION_MINUTES = 15;
export const MINUTES_PER_DAY = 24 * 60;

export type ResizeEdge = 'start' | 'end';

export interface MinuteInterval {
  startMinute: number;
  endMinute: number;
}

export interface EventTimingInterval {
  start: number;
  end: number;
}

interface ResizeOccurrence {
  event: CalendarEvent;
  calendar: Calendar | undefined;
  start: number;
  end: number;
}

const clampDayMinute = (minute: number): number => Math.max(0, Math.min(MINUTES_PER_DAY, minute));

export function pointerYToSnappedMinute(
  clientY: number,
  columnTop: number,
  hourHeight: number,
): number {
  if (!Number.isFinite(hourHeight) || hourHeight <= 0) return 0;
  const rawMinute = ((clientY - columnTop) / hourHeight) * 60;
  return clampDayMinute(Math.round(rawMinute / RESIZE_SNAP_MINUTES) * RESIZE_SNAP_MINUTES);
}

export function resizeMinuteInterval(
  original: MinuteInterval,
  edge: ResizeEdge,
  pointerMinute: number,
): MinuteInterval {
  const snappedMinute = clampDayMinute(
    Math.round(pointerMinute / RESIZE_SNAP_MINUTES) * RESIZE_SNAP_MINUTES,
  );

  if (edge === 'start') {
    const latestStart =
      Math.floor((original.endMinute - MIN_RESIZE_DURATION_MINUTES) / RESIZE_SNAP_MINUTES) *
      RESIZE_SNAP_MINUTES;
    return {
      startMinute: Math.min(snappedMinute, latestStart),
      endMinute: original.endMinute,
    };
  }

  const earliestEnd =
    Math.ceil((original.startMinute + MIN_RESIZE_DURATION_MINUTES) / RESIZE_SNAP_MINUTES) *
    RESIZE_SNAP_MINUTES;
  return {
    startMinute: original.startMinute,
    endMinute: Math.max(snappedMinute, earliestEnd),
  };
}

export function hasTimingChanged(
  original: EventTimingInterval,
  next: EventTimingInterval,
): boolean {
  return original.start !== next.start || original.end !== next.end;
}

export function isEventResizable(
  occurrence: ResizeOccurrence,
  renderedDateKey: string,
  timeZone: string,
): boolean {
  const { event, calendar } = occurrence;
  if (!calendar || eventWriteRoute(calendar) === 'read-only' || event.allDay) return false;

  // Stage 1 deliberately has no series/instance scope chooser. This covers both
  // generated master occurrences and materialized provider exceptions.
  if (
    event.recurrenceRule !== null ||
    event.recurringEventId !== null ||
    event.recurrenceOriginalStartAt !== null
  ) {
    return false;
  }

  const storedStart = Date.parse(event.startAt);
  const storedEnd = Date.parse(event.endAt);
  if (
    !Number.isFinite(storedStart) ||
    !Number.isFinite(storedEnd) ||
    occurrence.start !== storedStart ||
    occurrence.end !== storedEnd
  ) {
    return false;
  }

  const startKey = toZonedDateKey(new Date(occurrence.start), timeZone);
  const finalInstant = Math.max(occurrence.start, occurrence.end - 1);
  const endKey = toZonedDateKey(new Date(finalInstant), timeZone);
  return startKey === renderedDateKey && endKey === renderedDateKey;
}

export function dateMinuteToInstant(
  dateKey: string,
  minute: number,
  timeZone: string,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || minute < 0 || minute > MINUTES_PER_DAY) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;

  const isNextDay = minute === MINUTES_PER_DAY;
  const hour = isNextDay ? 0 : Math.floor(minute / 60);
  const minuteWithinHour = isNextDay ? 0 : minute % 60;
  const sourceDate = zonedWallClockToUtc({ year, month, day, hour: 12 }, timeZone);
  if (toZonedDateKey(sourceDate, timeZone) !== dateKey) return null;

  const instant = zonedWallClockToUtc(
    { year, month, day: day + (isNextDay ? 1 : 0), hour, minute: minuteWithinHour },
    timeZone,
  );
  const expectedDateKey = isNextDay
    ? toZonedDateKey(
        zonedWallClockToUtc({ year, month, day: day + 1, hour: 12 }, timeZone),
        timeZone,
      )
    : dateKey;
  const parts = getZonedParts(instant, timeZone);

  // A DST spring-forward gap has no corresponding instant. Ignore that pointer
  // step instead of silently persisting a different wall-clock time.
  if (
    toZonedDateKey(instant, timeZone) !== expectedDateKey ||
    parts.hour !== hour ||
    parts.minute !== minuteWithinHour
  ) {
    return null;
  }

  return instant;
}
