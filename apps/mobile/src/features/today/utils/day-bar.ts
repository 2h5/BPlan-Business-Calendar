import { minuteOfDay, type Interval } from '@cal/domain';

const MINUTES_PER_DAY = 1440;

export interface DayBarBusy {
  key: string;
  start: number;
  end: number;
  color: string;
}

export interface DayBarInput {
  dayStart: Date;
  dayEnd: Date;
  now: Date;
  timeZone: string;
  workdayStartsAt: number | null;
  workdayEndsAt: number | null;
  /** Timed events only; all-day events are not part of the bar. */
  busy: readonly DayBarBusy[];
  /** Remaining free working time, as `calculateFreeTime` returns it. */
  free: readonly Interval[];
}

export interface DayBarSegment {
  key: string;
  kind: 'busy' | 'free';
  /** Percent of the bar's width. */
  left: number;
  width: number;
  color?: string;
  /** A busy segment that has already ended. */
  past?: boolean;
}

export interface DayBarModel {
  /** The bar's span, as local minutes of the day on whole hours. */
  startMinute: number;
  endMinute: number;
  /** Free segments first, so busy ones draw on top. */
  segments: DayBarSegment[];
  /** Where "now" falls, clamped to the bar. */
  nowPercent: number;
  /** About four whole-hour marks, each placed where its hour falls on the bar. */
  labels: { minute: number; percent: number }[];
}

/**
 * Lays out the Today day bar: the working day, widened to take in any event
 * outside it, with free time and events positioned as percentages.
 *
 * Works in local wall-clock minutes so the hour marks match the clock the
 * user reads, including on DST days. Returns null for a day with neither
 * working hours nor timed events — there is nothing to draw.
 */
export function buildDayBar(input: DayBarInput): DayBarModel | null {
  const toMinute = (instant: number): number => {
    if (instant <= input.dayStart.getTime()) return 0;
    if (instant >= input.dayEnd.getTime()) return MINUTES_PER_DAY;
    return minuteOfDay(new Date(instant), input.timeZone);
  };

  const starts = input.busy.map((item) => toMinute(item.start));
  const ends = input.busy.map((item) => toMinute(item.end));
  if (input.workdayStartsAt !== null) starts.push(toMinute(input.workdayStartsAt));
  if (input.workdayEndsAt !== null) ends.push(toMinute(input.workdayEndsAt));
  if (starts.length === 0 || ends.length === 0) return null;

  const startMinute = Math.max(0, Math.floor(Math.min(...starts) / 60) * 60);
  let endMinute = Math.min(MINUTES_PER_DAY, Math.ceil(Math.max(...ends) / 60) * 60);
  if (endMinute - startMinute < 60) endMinute = Math.min(MINUTES_PER_DAY, startMinute + 60);
  const span = endMinute - startMinute;

  const percent = (minute: number): number =>
    Math.min(100, Math.max(0, ((minute - startMinute) / span) * 100));

  const segment = (
    key: string,
    kind: DayBarSegment['kind'],
    start: number,
    end: number,
    color?: string,
  ): DayBarSegment | null => {
    const left = percent(toMinute(start));
    const right = percent(toMinute(end));
    if (right <= left) return null;
    return {
      key,
      kind,
      left,
      width: right - left,
      ...(color ? { color } : {}),
      ...(kind === 'busy' && end <= input.now.getTime() ? { past: true } : {}),
    };
  };

  const segments = [
    ...input.free.map((interval, index) =>
      segment(`free:${index}`, 'free', interval.start, interval.end),
    ),
    ...input.busy.map((item) => segment(item.key, 'busy', item.start, item.end, item.color)),
  ].filter((item): item is DayBarSegment => item !== null);

  return {
    startMinute,
    endMinute,
    segments,
    nowPercent: percent(toMinute(input.now.getTime())),
    labels: hourMarks(startMinute, endMinute).map((minute) => ({
      minute,
      percent: percent(minute),
    })),
  };
}

/** The two ends, plus whole hours between them at an even step of at least an hour. */
function hourMarks(startMinute: number, endMinute: number): number[] {
  const hours = (endMinute - startMinute) / 60;
  const step = Math.max(1, Math.round(hours / 3));
  const marks: number[] = [];
  for (let hour = step; hour < hours; hour += step) {
    // Skip a mark that would crowd the end label.
    if (hours - hour >= step / 2) marks.push(startMinute + hour * 60);
  }
  return [startMinute, ...marks, endMinute];
}

/** "8a", "12p" on a 12-hour clock; "08", "12" on a 24-hour one. */
export function formatHourMark(minute: number, hourCycle: 'h12' | 'h23'): string {
  const hour = Math.floor(minute / 60) % 24;
  if (hourCycle === 'h23') return String(hour).padStart(2, '0');
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${hour < 12 ? 'a' : 'p'}`;
}
