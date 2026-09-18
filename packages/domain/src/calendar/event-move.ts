import type { Calendar, CalendarEvent } from '@cal/schemas';

import { addZonedDays, getZonedParts, toZonedDateKey, zonedWallClockToUtc } from '../time/timezone';

/**
 * Turning a drag into a new time for an event.
 *
 * The maths lives here rather than in the gesture so it can be tested without
 * a touch: a drag only ever produces two numbers — how far the finger moved
 * down the hour grid, and how many day columns it crossed — and everything
 * else is calendar arithmetic.
 */

/** Dropped times land on this grid, so a drag cannot produce 11:03. */
export const MOVE_SNAP_MINUTES = 15;
export const MINUTES_PER_DAY = 24 * 60;

export interface MovedInterval {
  /** Whole local days from the day the event was picked up on. */
  dayDelta: number;
  /** Minute of day the event now starts and ends at, both snapped. */
  startMinute: number;
  endMinute: number;
}

const clampDayMinute = (minute: number): number => Math.max(0, Math.min(MINUTES_PER_DAY, minute));

/**
 * Where a drag puts an event.
 *
 * The vertical travel is snapped as a *delta* rather than by snapping the
 * resulting start time, so an event that began at 11:07 stays seven minutes
 * past the hour after a drag instead of being quietly tidied onto the grid by
 * the act of moving it.
 *
 * The event is kept whole inside its day: dragging past midnight pins it to
 * the end of the day rather than splitting it or letting it run off the grid.
 * Crossing to another day is `dayDelta`'s job, which is what the horizontal
 * travel across day columns feeds.
 */
export function resolveMovedInterval(params: {
  startMinute: number;
  durationMinutes: number;
  deltaMinutes: number;
  dayDelta: number;
  snapMinutes?: number;
}): MovedInterval {
  const snap = params.snapMinutes ?? MOVE_SNAP_MINUTES;
  const duration = Math.max(0, Math.min(MINUTES_PER_DAY, params.durationMinutes));
  const snappedDelta = Math.round(params.deltaMinutes / snap) * snap;

  const latestStart = MINUTES_PER_DAY - duration;
  const startMinute = Math.max(0, Math.min(latestStart, params.startMinute + snappedDelta));

  return {
    dayDelta: params.dayDelta,
    startMinute: clampDayMinute(startMinute),
    endMinute: clampDayMinute(startMinute + duration),
  };
}

/**
 * The instant a local date key and minute of day refer to.
 *
 * Returns null where that wall-clock time does not exist — the hour a
 * spring-forward DST change skips. A drag that lands there is ignored rather
 * than persisted as some other time the user did not aim at.
 */
export function dateKeyMinuteToInstant(
  dateKey: string,
  minute: number,
  timeZone: string,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || minute < 0 || minute > MINUTES_PER_DAY) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;

  // Minute 1440 is midnight *ending* the day — i.e. the next day's midnight.
  const isNextDay = minute === MINUTES_PER_DAY;
  const hour = isNextDay ? 0 : Math.floor(minute / 60);
  const minuteWithinHour = isNextDay ? 0 : minute % 60;

  // Midday is never skipped by a DST change, so it is a safe probe for whether
  // the date key itself is a real date in this zone.
  const probe = zonedWallClockToUtc({ year, month, day, hour: 12 }, timeZone);
  if (toZonedDateKey(probe, timeZone) !== dateKey) return null;

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

  if (
    toZonedDateKey(instant, timeZone) !== expectedDateKey ||
    parts.hour !== hour ||
    parts.minute !== minuteWithinHour
  ) {
    return null;
  }

  return instant;
}

export interface MovableOccurrence {
  event: Pick<
    CalendarEvent,
    | 'allDay'
    | 'startAt'
    | 'endAt'
    | 'recurrenceRule'
    | 'recurringEventId'
    | 'recurrenceOriginalStartAt'
  >;
  calendar: Pick<Calendar, 'isReadOnly' | 'sourceType'> | undefined;
  /** Epoch milliseconds, as drawn. */
  start: number;
  end: number;
}

/**
 * Whether this occurrence can be dragged, as drawn on `renderedDateKey`.
 *
 * Four things disqualify one, each because moving it would mean more than
 * writing a new start and end:
 *
 * - **All-day events** have no position on the hour grid to drag to.
 * - **Read-only calendars** cannot be written at all.
 * - **Anything recurring** — a generated occurrence or a provider exception —
 *   needs a "this event or the whole series?" choice that does not exist yet,
 *   and silently picking one would be a destructive guess.
 * - **Occurrences that are not the stored row, or that span more than the day
 *   they are drawn on**, because the chip is then a clipped fragment and the
 *   drag delta would not describe the event's real extent.
 */
function isWritableOccurrence(occurrence: MovableOccurrence): boolean {
  const { event, calendar } = occurrence;
  if (!calendar || calendar.isReadOnly) return false;

  if (
    event.recurrenceRule !== null ||
    event.recurringEventId !== null ||
    event.recurrenceOriginalStartAt !== null
  ) {
    return false;
  }

  // The drawn occurrence must *be* the stored row. A generated one has no row
  // of its own to write, and moving the master would move every occurrence.
  const storedStart = Date.parse(event.startAt);
  const storedEnd = Date.parse(event.endAt);
  return (
    Number.isFinite(storedStart) &&
    Number.isFinite(storedEnd) &&
    occurrence.start === storedStart &&
    occurrence.end === storedEnd
  );
}

export function isOccurrenceMovable(
  occurrence: MovableOccurrence,
  renderedDateKey: string,
  timeZone: string,
): boolean {
  if (!isWritableOccurrence(occurrence) || occurrence.event.allDay) return false;

  // `end` is exclusive, so an event finishing at midnight still belongs to the
  // day it ran in — step back one millisecond before asking which day that is.
  const startKey = toZonedDateKey(new Date(occurrence.start), timeZone);
  const endKey = toZonedDateKey(new Date(Math.max(occurrence.start, occurrence.end - 1)), timeZone);
  return startKey === renderedDateKey && endKey === renderedDateKey;
}

/**
 * Whether this occurrence can be dragged to another *date*, as the month grid
 * moves one.
 *
 * Looser than `isOccurrenceMovable` in the two ways a month cell allows. An
 * all-day event has somewhere to go here — another date — where on an hour
 * grid it has none. And a multi-day event is drawn as one whole bar rather
 * than a clipped fragment, so shifting both its ends by the same number of
 * days is well defined.
 */
export function isOccurrenceMovableByDay(occurrence: MovableOccurrence): boolean {
  return isWritableOccurrence(occurrence);
}

/**
 * The same event, whole days later or earlier.
 *
 * Both ends move by local days rather than by a fixed number of milliseconds,
 * so an event keeps its wall-clock time across a DST change — a 9am meeting
 * dragged over one stays at 9am, which is what a calendar is expected to do,
 * rather than becoming 8am or 10am.
 */
export function shiftOccurrenceByDays(
  occurrence: { start: number; end: number },
  dayDelta: number,
  timeZone: string,
): { startAt: Date; endAt: Date } {
  return {
    startAt: addZonedDays(new Date(occurrence.start), dayDelta, timeZone),
    endAt: addZonedDays(new Date(occurrence.end), dayDelta, timeZone),
  };
}
