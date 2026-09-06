import {
  addZonedDays,
  getZonedParts,
  startOfZonedDay,
  toZonedDateKey,
  zonedWallClockToUtc,
} from '@cal/domain';

export type CalendarViewMode = 'day' | 'week' | 'month';

export interface CalendarWindow {
  start: Date;
  end: Date;
  dateKeys: string[];
}

export function dateKeyToInstant(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return zonedWallClockToUtc(
    { year: year ?? 1970, month: month ?? 1, day: day ?? 1, hour: 0, minute: 0 },
    timeZone,
  );
}

function localWeekday(instant: Date, timeZone: string): number {
  return getZonedParts(instant, timeZone).weekday;
}

export function startOfWeek(instant: Date, timeZone: string, weekStartsOn: number): Date {
  const dayStart = startOfZonedDay(instant, timeZone);
  const daysBack = (localWeekday(dayStart, timeZone) - weekStartsOn + 7) % 7;
  return addZonedDays(dayStart, -daysBack, timeZone);
}

function daySpan(start: Date, days: number, timeZone: string): CalendarWindow {
  const dateKeys = Array.from({ length: days }, (_, offset) =>
    toZonedDateKey(addZonedDays(start, offset, timeZone), timeZone),
  );
  return { start, end: addZonedDays(start, days, timeZone), dateKeys };
}

export function windowForView(
  mode: CalendarViewMode,
  selectedDateKey: string,
  timeZone: string,
  weekStartsOn: number,
): CalendarWindow {
  const anchor = dateKeyToInstant(selectedDateKey, timeZone);
  if (mode === 'day') return daySpan(anchor, 1, timeZone);
  if (mode === 'week') return daySpan(startOfWeek(anchor, timeZone, weekStartsOn), 7, timeZone);

  const [year, month] = selectedDateKey.split('-').map(Number);
  const firstOfMonth = zonedWallClockToUtc(
    { year: year ?? 1970, month: month ?? 1, day: 1 },
    timeZone,
  );
  return daySpan(startOfWeek(firstOfMonth, timeZone, weekStartsOn), 42, timeZone);
}

export function shiftDateKey(
  dateKey: string,
  mode: CalendarViewMode,
  direction: -1 | 1,
  timeZone: string,
): string {
  const anchor = dateKeyToInstant(dateKey, timeZone);
  if (mode !== 'month') {
    return toZonedDateKey(
      addZonedDays(anchor, (mode === 'day' ? 1 : 7) * direction, timeZone),
      timeZone,
    );
  }

  const [year = 1970, month = 1, day = 1] = dateKey.split('-').map(Number);
  const absoluteMonth = year * 12 + month - 1 + direction;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function formatRangeHeading(
  mode: CalendarViewMode,
  selectedDateKey: string,
  window: CalendarWindow,
  timeZone: string,
): string {
  const anchor = dateKeyToInstant(selectedDateKey, timeZone);
  if (mode === 'day') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(anchor);
  }
  if (mode === 'month') {
    return new Intl.DateTimeFormat('en-US', { timeZone, month: 'long', year: 'numeric' }).format(
      anchor,
    );
  }

  const end = new Date(window.end.getTime() - 1);
  const startParts = getZonedParts(window.start, timeZone);
  const endParts = getZonedParts(end, timeZone);
  const startLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
  }).format(window.start);
  const endLabel = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: startParts.month === endParts.month ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(end);
  return `${startLabel} – ${endLabel}`;
}
