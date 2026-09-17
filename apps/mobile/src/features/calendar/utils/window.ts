import { addZonedDays, startOfZonedDay, toZonedDateKey, zonedWallClockToUtc } from '@cal/domain';

import type { CalendarViewMode } from '../../../store/calendar-view.store';

/** Midnight-to-midnight span, in the user's zone, that a view needs loaded. */
export interface CalendarWindow {
  start: Date;
  end: Date;
  /** Local date keys the view renders, in order. */
  dateKeys: string[];
}

/** "2026-08-30" → the instant that local day begins. */
export function dateKeyToInstant(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return zonedWallClockToUtc(
    { year: year ?? 1970, month: month ?? 1, day: day ?? 1, hour: 0, minute: 0 },
    timeZone,
  );
}

const daySpan = (start: Date, days: number, timeZone: string): CalendarWindow => {
  const dateKeys: string[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    dateKeys.push(toZonedDateKey(addZonedDays(start, offset, timeZone), timeZone));
  }
  return { start, end: addZonedDays(start, days, timeZone), dateKeys };
};

/** Every local day from `start` up to, but not including, `end`. */
const spanUntil = (start: Date, end: Date, timeZone: string): CalendarWindow => {
  const dateKeys: string[] = [];
  for (let offset = 0; offset < 200; offset += 1) {
    const day = addZonedDays(start, offset, timeZone);
    if (day >= end) break;
    dateKeys.push(toZonedDateKey(day, timeZone));
  }
  return { start, end, dateKeys };
};

/** "2026-09-10" → months since year 0, so month arithmetic is plain addition. */
export function monthIndexOf(dateKey: string): number {
  const [year, month] = dateKey.split('-').map(Number);
  return (year ?? 1970) * 12 + ((month ?? 1) - 1);
}

/** A month index back to its calendar month, 1-12. */
export function monthOfIndex(monthIndex: number): number {
  return (((monthIndex % 12) + 12) % 12) + 1;
}

/** The first cell of a month's six-week grid. */
function monthGridStart(monthIndex: number, timeZone: string, weekStartsOn: number): Date {
  const firstOfMonth = zonedWallClockToUtc(
    {
      year: Math.floor(monthIndex / 12),
      month: monthOfIndex(monthIndex),
      day: 1,
      hour: 0,
      minute: 0,
    },
    timeZone,
  );
  return startOfWeek(firstOfMonth, timeZone, weekStartsOn);
}

/** The 42 date keys a month's grid draws: six whole weeks. */
export function monthGridKeys(
  monthIndex: number,
  timeZone: string,
  weekStartsOn: number,
): string[] {
  return daySpan(monthGridStart(monthIndex, timeZone, weekStartsOn), 42, timeZone).dateKeys;
}

/** Days since 1970-01-01 — an integer that steps by one per calendar day. */
export function dayIndexOf(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.round(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/**
 * Day of the week for a date key, 0 = Sunday. Pure calendar arithmetic, so it
 * holds in every zone — reading it off the zoned midnight instant would give
 * the previous weekday anywhere east of UTC.
 */
export function weekdayOf(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

/** The date key `days` local days away from `dateKey`. */
export function shiftDateKey(dateKey: string, days: number, timeZone: string): string {
  return toZonedDateKey(
    addZonedDays(dateKeyToInstant(dateKey, timeZone), days, timeZone),
    timeZone,
  );
}

/**
 * An integer that steps by one per week, for paging. Week-start keys all share
 * a weekday, so their day counts differ by exact multiples of seven.
 */
export function weekIndexOf(dateKey: string, timeZone: string, weekStartsOn: number): number {
  const startKey = toZonedDateKey(
    startOfWeek(dateKeyToInstant(dateKey, timeZone), timeZone, weekStartsOn),
    timeZone,
  );
  return Math.round(dayIndexOf(startKey) / 7);
}

/** The seven date keys of the week `offsetWeeks` away from the one holding `dateKey`. */
export function weekDateKeys(
  dateKey: string,
  offsetWeeks: number,
  timeZone: string,
  weekStartsOn: number,
): string[] {
  const start = startOfWeek(dateKeyToInstant(dateKey, timeZone), timeZone, weekStartsOn);
  return daySpan(addZonedDays(start, offsetWeeks * 7, timeZone), 7, timeZone).dateKeys;
}

/** Start of the week containing `instant`, honouring the user's week start. */
export function startOfWeek(instant: Date, timeZone: string, weekStartsOn: number): Date {
  const startOfDay = startOfZonedDay(instant, timeZone);
  // The weekday must be read in the user's zone, not UTC's: at 20:00 in New
  // York the UTC date is already tomorrow, and a whole week would be off by one.
  const back = (localWeekdayOf(startOfDay, timeZone) - weekStartsOn + 7) % 7;
  return addZonedDays(startOfDay, -back, timeZone);
}

function localWeekdayOf(instant: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

/**
 * The window a view needs.
 *
 * Month deliberately spans whole weeks rather than whole months so the grid's
 * leading and trailing days are populated instead of blank, and covers the
 * neighbouring months' grids as well so a swipe between them is never empty.
 */
export function windowForView(
  mode: CalendarViewMode,
  selectedDateKey: string,
  timeZone: string,
  weekStartsOn: number,
): CalendarWindow {
  const anchor = dateKeyToInstant(selectedDateKey, timeZone);

  switch (mode) {
    case 'day':
      // Yesterday and tomorrow load too, so a swipe drags them in already drawn.
      return daySpan(addZonedDays(anchor, -1, timeZone), 3, timeZone);

    case 'week':
      // The weeks either side load too, so a swipe drags them in already drawn.
      return daySpan(
        addZonedDays(startOfWeek(anchor, timeZone, weekStartsOn), -7, timeZone),
        21,
        timeZone,
      );

    case 'month': {
      // The previous and next months load too: a swipe drags them into view
      // before it commits, and they should arrive with their events drawn.
      const index = monthIndexOf(selectedDateKey);
      const start = monthGridStart(index - 1, timeZone, weekStartsOn);
      const end = addZonedDays(monthGridStart(index + 1, timeZone, weekStartsOn), 42, timeZone);
      return spanUntil(start, end, timeZone);
    }

    case 'agenda':
      // Four weeks forward is enough to feel endless without a huge fetch.
      return daySpan(anchor, 28, timeZone);
  }
}
