import { formatDuration, formatTimeOfDay, type FreeTimeSummary } from '@cal/domain';

import type { EventOccurrence } from '../../calendar/hooks/useCalendarWindow';

export interface DayGlanceInput {
  now: Date;
  timeZone: string;
  hourCycle: 'h12' | 'h23';
  /** Timed occurrences in start order. */
  timed: readonly EventOccurrence[];
  allDay: readonly EventOccurrence[];
  freeTime: FreeTimeSummary;
  workdayEndsAt: number | null;
}

export interface DayGlance {
  /** The occurrence the card is about: the running or next timed event, else today's all-day one. */
  headline: EventOccurrence | null;
  /** An event is running right now — the one question the card's colour answers. */
  live: boolean;
  /** "Now · ends 9:30 PM", "Up next · in 48m", "Today". */
  eyebrow: string;
  title: string;
  meta: string;
  /** "5h 30m free", "Workday done", "Fully booked", "Day off". */
  capacity: string;
  capacityDetail: string | null;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The words on the Today glance card, matching mobile's Up Next card so both
 * apps describe the same moment the same way.
 */
export function describeDayGlance(input: DayGlanceInput): DayGlance {
  const { now, timeZone, hourCycle, timed, allDay, freeTime, workdayEndsAt } = input;
  const nowMs = now.getTime();
  const time = (ms: number) => formatTimeOfDay(new Date(ms), timeZone, hourCycle);

  const next = timed.find((item) => item.end > nowMs) ?? null;
  // With nothing timed left, today's all-day event is still the thing "on".
  const headline = next ?? allDay[0] ?? null;
  const live = next ? nowMs >= next.start : false;
  const minutesUntilNext = next ? Math.max(0, Math.round((next.start - nowMs) / 60_000)) : 0;

  const eyebrow = next
    ? live
      ? `Now · ends ${time(next.end)}`
      : minutesUntilNext === 0
        ? 'Up next · starting now'
        : `Up next · in ${formatDuration(minutesUntilNext)}`
    : headline
      ? 'Today'
      : 'Up next';

  const meta = next
    ? [`${time(next.start)} – ${time(next.end)}`, next.event.location ?? next.calendar?.name]
        .filter(Boolean)
        .join(' · ')
    : headline
      ? ['All day', headline.event.location].filter(Boolean).join(' · ')
      : 'Your calendar is clear for the rest of today';

  let capacity: string;
  let capacityDetail: string | null;
  if (workdayEndsAt === null) {
    capacity = 'Day off';
    capacityDetail = 'no working hours set';
  } else if (nowMs >= workdayEndsAt) {
    capacity = 'Workday done';
    capacityDetail = `ended ${time(workdayEndsAt)}`;
  } else if (freeTime.freeMinutes > 0) {
    capacity = `${formatDuration(freeTime.freeMinutes)} free`;
    capacityDetail = plural(freeTime.intervals.length, 'open block');
  } else {
    capacity = 'Fully booked';
    capacityDetail = null;
  }

  return {
    headline,
    live,
    eyebrow,
    title: headline?.event.title ?? 'Nothing else scheduled',
    meta,
    capacity,
    capacityDetail,
  };
}
