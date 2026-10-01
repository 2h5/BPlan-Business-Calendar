import { formatTimeOfDay } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';

import { weekDateKeys, weekIndexOf } from './window';

/**
 * One line of the agenda: a day with events, a run of empty days folded into
 * a single line, or the divider that opens a new week.
 */
export type AgendaRow =
  | { kind: 'week'; key: string; weekStartKey: string }
  | { kind: 'day'; key: string; dateKey: string }
  | { kind: 'gap'; key: string; fromKey: string; toKey: string };

export interface PlanAgendaRowsInput {
  dateKeys: readonly string[];
  isPopulated: (dateKey: string) => boolean;
  todayKey: string;
  timeZone: string;
  weekStartsOn: number;
}

/**
 * Lays the window out as rows. Days with events get a row; so does today even
 * when empty, so the list always says where "now" is. Empty runs between them
 * fold into one gap line instead of vanishing, which keeps the passage of time
 * readable. A week divider opens each day row whose week differs from the
 * previous day row's.
 */
export function planAgendaRows({
  dateKeys,
  isPopulated,
  todayKey,
  timeZone,
  weekStartsOn,
}: PlanAgendaRowsInput): AgendaRow[] {
  const rows: AgendaRow[] = [];
  let gapStart: string | null = null;
  let gapEnd: string | null = null;
  let lastWeek: number | null = null;

  const closeGap = () => {
    if (gapStart && gapEnd) {
      rows.push({ kind: 'gap', key: `gap:${gapStart}`, fromKey: gapStart, toKey: gapEnd });
    }
    gapStart = null;
    gapEnd = null;
  };

  for (const dateKey of dateKeys) {
    if (!isPopulated(dateKey) && dateKey !== todayKey) {
      gapStart ??= dateKey;
      gapEnd = dateKey;
      continue;
    }

    closeGap();

    const week = weekIndexOf(dateKey, timeZone, weekStartsOn);
    if (lastWeek !== null && week !== lastWeek) {
      const weekStartKey = weekDateKeys(dateKey, 0, timeZone, weekStartsOn)[0] ?? dateKey;
      rows.push({ kind: 'week', key: `week:${weekStartKey}`, weekStartKey });
    }
    lastWeek = week;

    rows.push({ kind: 'day', key: `day:${dateKey}`, dateKey });
  }

  closeGap();
  return rows;
}

export interface OccurrenceTiming {
  /** "11:00 – 12:00", "Until 10:00", "From 22:00", or "All day". */
  label: string;
  /** Length in minutes when the event starts and ends on this day, else null. */
  minutes: number | null;
  /** True when the event fills the whole day, so it belongs with all-day events. */
  fillsDay: boolean;
}

/**
 * How an occurrence reads on one day of the agenda. An event crossing midnight
 * appears on each day it touches, and says which end of it this day holds.
 */
export function describeTiming(
  occurrence: { start: number; end: number; allDay: boolean },
  dayStart: number,
  dayEnd: number,
  timeZone: string,
  hourCycle: HourCycle,
): OccurrenceTiming {
  const time = (instant: number) => formatTimeOfDay(new Date(instant), timeZone, hourCycle);
  const startsEarlier = occurrence.start < dayStart;
  const endsLater = occurrence.end > dayEnd;

  if (occurrence.allDay || (startsEarlier && endsLater)) {
    return { label: 'All day', minutes: null, fillsDay: true };
  }
  if (startsEarlier) {
    return { label: `Until ${time(occurrence.end)}`, minutes: null, fillsDay: false };
  }
  if (endsLater) {
    return { label: `From ${time(occurrence.start)}`, minutes: null, fillsDay: false };
  }
  if (occurrence.end <= occurrence.start) {
    return { label: time(occurrence.start), minutes: null, fillsDay: false };
  }
  return {
    label: `${time(occurrence.start)} – ${time(occurrence.end)}`,
    minutes: Math.round((occurrence.end - occurrence.start) / 60_000),
    fillsDay: false,
  };
}

/**
 * Where the current-time line sits among a day's timed events: before the
 * first one still to start. Events already under way stay above it.
 */
export function nowLineIndex(occurrences: readonly { start: number }[], now: number): number {
  const index = occurrences.findIndex((occurrence) => occurrence.start > now);
  return index === -1 ? occurrences.length : index;
}

/**
 * A date key as text. Date keys are calendar dates, not instants, so they
 * format in UTC — reading them in the user's zone would shift them a day.
 */
function formatDateKey(dateKey: string, options: Intl.DateTimeFormatOptions): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(date);
}

/** "Wed". */
export const formatWeekdayShort = (dateKey: string): string =>
  formatDateKey(dateKey, { weekday: 'short' });

/** "Wednesday, 30 September" in the device's own order. */
export const formatDayLong = (dateKey: string): string =>
  formatDateKey(dateKey, { weekday: 'long', day: 'numeric', month: 'long' });

/** "Sat, Oct 3" for one day, "Oct 3 – Oct 5" for a run. */
export function formatGapRange(fromKey: string, toKey: string): string {
  if (fromKey === toKey) {
    return formatDateKey(fromKey, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const short = { day: 'numeric', month: 'short' } as const;
  return `${formatDateKey(fromKey, short)} – ${formatDateKey(toKey, short)}`;
}

/** "Week of Oct 4". */
export const formatWeekOf = (weekStartKey: string): string =>
  `Week of ${formatDateKey(weekStartKey, { day: 'numeric', month: 'short' })}`;
