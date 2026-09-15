import type { ScheduleConstraints, WorkingHours } from '@cal/schemas/scheduling';

import { MINUTE_MS, type Interval, intersect, normalize, pad, subtract } from '../time/interval.ts';
import {
  addZonedDays,
  getZonedParts,
  startOfZonedDay,
  zonedWallClockToUtc,
} from '../time/timezone.ts';

/**
 * The deterministic availability engine.
 *
 * Architectural rule (docs/ai-scheduling.md): the AI never decides whether a
 * time is free. It receives the slots this file produces and may only rank and
 * explain them. Every guarantee users rely on — no overlaps, working hours
 * respected, buffers honoured, deadline met — is enforced here, in code that is
 * pure, synchronous, and unit-tested.
 */

export interface CandidateSlot extends Interval {
  /** Stable within one request; the AI refers to slots by this id. */
  id: string;
}

export interface AvailabilityInput {
  constraints: ScheduleConstraints;
  /** Every busy interval already known for the window (events, time blocks). */
  busy: readonly Interval[];
}

const TIME_OF_DAY_RANGES: Record<string, { from: number; to: number } | null> = {
  morning: { from: 5 * 60, to: 12 * 60 },
  afternoon: { from: 12 * 60, to: 17 * 60 },
  evening: { from: 17 * 60, to: 22 * 60 },
  any: null,
};

/**
 * Expand per-weekday working windows into concrete UTC intervals covering
 * `window`. Windows are interpreted in local wall-clock time, so a 09:00–17:00
 * Monday stays 09:00–17:00 across a DST boundary.
 */
export function expandWorkingHours(
  window: Interval,
  workingHours: WorkingHours,
  timeZone: string,
): Interval[] {
  if (workingHours.length === 0) return [];

  const byWeekday = new Map<number, WorkingHours>();
  for (const w of workingHours) {
    const list = byWeekday.get(w.weekday) ?? [];
    list.push(w);
    byWeekday.set(w.weekday, list);
  }

  const result: Interval[] = [];
  // Step from the local day containing the window start until we pass its end.
  // The +1 day of slack covers windows that end just after local midnight.
  let cursor = startOfZonedDay(new Date(window.start), timeZone);
  const limit = window.end;

  for (let guard = 0; cursor.getTime() <= limit && guard < 400; guard += 1) {
    const parts = getZonedParts(cursor, timeZone);
    for (const w of byWeekday.get(parts.weekday) ?? []) {
      const start = zonedWallClockToUtc(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: Math.floor(w.startMinute / 60),
          minute: w.startMinute % 60,
        },
        timeZone,
      );
      const end = zonedWallClockToUtc(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: Math.floor(w.endMinute / 60),
          minute: w.endMinute % 60,
        },
        timeZone,
      );

      const clipped = intersect({ start: start.getTime(), end: end.getTime() }, window);
      if (clipped) result.push(clipped);
    }
    cursor = addZonedDays(cursor, 1, timeZone);
  }

  return normalize(result);
}

/** Clip intervals to a local-time band, e.g. "never before 08:00". */
function clipToMinuteBand(
  intervals: readonly Interval[],
  timeZone: string,
  earliestMinute?: number,
  latestMinute?: number,
): Interval[] {
  if (earliestMinute === undefined && latestMinute === undefined) return [...intervals];

  const result: Interval[] = [];
  for (const interval of intervals) {
    const parts = getZonedParts(new Date(interval.start), timeZone);
    const dayStart = { year: parts.year, month: parts.month, day: parts.day };

    const lower =
      earliestMinute === undefined
        ? interval.start
        : zonedWallClockToUtc(
            {
              ...dayStart,
              hour: Math.floor(earliestMinute / 60),
              minute: earliestMinute % 60,
            },
            timeZone,
          ).getTime();

    const upper =
      latestMinute === undefined
        ? interval.end
        : zonedWallClockToUtc(
            { ...dayStart, hour: Math.floor(latestMinute / 60), minute: latestMinute % 60 },
            timeZone,
          ).getTime();

    const clipped = intersect(interval, { start: lower, end: upper });
    if (clipped) result.push(clipped);
  }
  return normalize(result);
}

/**
 * Intervals in which work may actually happen: inside the request window,
 * inside working hours, inside any minute band, and clear of everything busy
 * (busy intervals grown by the requested buffer on both sides).
 */
export function findFreeIntervals(input: AvailabilityInput): Interval[] {
  const { constraints, busy } = input;
  const window: Interval = {
    start: new Date(constraints.windowStart).getTime(),
    end: new Date(constraints.windowEnd).getTime(),
  };
  if (window.end <= window.start) return [];

  const working = expandWorkingHours(window, constraints.workingHours, constraints.timezone);
  const banded = clipToMinuteBand(
    working,
    constraints.timezone,
    constraints.earliestMinute,
    constraints.latestMinute,
  );

  const blocked =
    constraints.bufferMinutes > 0 ? pad(busy, constraints.bufferMinutes) : normalize(busy);

  return subtract(banded, blocked);
}

/**
 * Every placement of `durationMinutes` that fits inside a free interval,
 * offered on the requested granularity grid and aligned to local clock time so
 * proposals land on tidy times like 10:15 rather than 10:07.
 */
export function generateCandidateSlots(input: AvailabilityInput): CandidateSlot[] {
  const { constraints } = input;
  const durations =
    constraints.allowedDurationsMinutes && constraints.allowedDurationsMinutes.length > 0
      ? [...new Set(constraints.allowedDurationsMinutes)]
      : [constraints.durationMinutes];
  const free = findFreeIntervals(input);

  const slots: CandidateSlot[] = [];
  for (const interval of free) {
    const exactStart =
      constraints.exactStartMinute === undefined
        ? undefined
        : exactStartForLocalDate(interval, constraints.exactStartMinute, constraints.timezone);

    // A requested exact local time can fall inside a spring-forward gap. The
    // timezone helper has a general-purpose shift-forward policy, but an
    // exact scheduling request must fail closed instead of silently moving to
    // a different wall-clock label.
    if (exactStart === null) continue;

    for (const durationMinutes of durations) {
      const duration = durationMinutes * MINUTE_MS;
      if (interval.end - interval.start < duration) continue;

      if (exactStart !== undefined) {
        if (exactStart < interval.start || exactStart + duration > interval.end) continue;
        slots.push({
          id: `slot_${slots.length + 1}`,
          start: exactStart,
          end: exactStart + duration,
        });
        continue;
      }

      for (
        let start = alignToGrid(
          interval.start,
          constraints.granularityMinutes,
          constraints.timezone,
        );
        start + duration <= interval.end;
        start = advanceOnLocalGrid(start, constraints.granularityMinutes, constraints.timezone)
      ) {
        if (start < interval.start) continue;
        slots.push({
          id: `slot_${slots.length + 1}`,
          start,
          end: start + duration,
        });
      }
    }
  }

  slots.sort((a, b) => a.start - b.start || a.end - a.start - (b.end - b.start));
  return slots.map((slot, index) => ({
    ...slot,
    id: `slot_${index + 1}`,
  }));
}

function exactStartForLocalDate(
  interval: Interval,
  exactStartMinute: number,
  timeZone: string,
): number | null {
  const parts = getZonedParts(new Date(interval.start), timeZone);
  const start = zonedWallClockToUtc(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: Math.floor(exactStartMinute / 60),
      minute: exactStartMinute % 60,
    },
    timeZone,
  );
  const resolvedParts = getZonedParts(start, timeZone);
  if (
    resolvedParts.year !== parts.year ||
    resolvedParts.month !== parts.month ||
    resolvedParts.day !== parts.day ||
    resolvedParts.hour !== Math.floor(exactStartMinute / 60) ||
    resolvedParts.minute !== exactStartMinute % 60
  ) {
    return null;
  }
  return start.getTime();
}

/** Round an instant up to the next local `granularity`-minute boundary. */
function alignToGrid(instant: number, granularityMinutes: number, timeZone: string): number {
  const parts = getZonedParts(new Date(instant), timeZone);
  const remainder = parts.minute % granularityMinutes;
  const ms = new Date(instant).getMilliseconds();
  if (remainder === 0 && parts.second === 0 && ms === 0) return instant;
  const elapsedMs = (remainder * 60 + parts.second) * 1000 + ms;
  return instant + (granularityMinutes * MINUTE_MS - elapsedMs);
}

/** Advance to the next valid local-clock grid point, skipping DST gaps. */
function advanceOnLocalGrid(instant: number, granularityMinutes: number, timeZone: string): number {
  let current: LocalClockParts = getZonedParts(new Date(instant), timeZone);
  for (let guard = 0; guard < 300; guard += 1) {
    const next = nextLocalGridParts(current, granularityMinutes);
    const candidate = zonedWallClockToUtc(next, timeZone);
    const resolved = getZonedParts(candidate, timeZone);
    const isExactWallClock =
      resolved.year === next.year &&
      resolved.month === next.month &&
      resolved.day === next.day &&
      resolved.hour === next.hour &&
      resolved.minute === next.minute;
    if (isExactWallClock && candidate.getTime() > instant) return candidate.getTime();
    current = next;
  }
  return Number.POSITIVE_INFINITY;
}

function nextLocalGridParts(current: LocalClockParts, granularityMinutes: number): LocalClockParts {
  const nextMinute =
    current.minute + granularityMinutes < 60 ? current.minute + granularityMinutes : 0;
  const nextHour = current.minute + granularityMinutes < 60 ? current.hour : current.hour + 1;
  const normalized = new Date(
    Date.UTC(current.year, current.month - 1, current.day, nextHour, nextMinute),
  );
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
    day: normalized.getUTCDate(),
    hour: normalized.getUTCHours(),
    minute: normalized.getUTCMinutes(),
  };
}

type LocalClockParts = Pick<
  ReturnType<typeof getZonedParts>,
  'year' | 'month' | 'day' | 'hour' | 'minute'
>;

/**
 * A cheap, explainable ordering used when the AI tier is unavailable — and as
 * the sanity baseline the AI's ranking is compared against.
 * Earlier is better; the preferred part of day wins ties.
 */
export function rankSlotsHeuristically(
  slots: readonly CandidateSlot[],
  constraints: ScheduleConstraints,
): CandidateSlot[] {
  const preferred = TIME_OF_DAY_RANGES[constraints.preferredTimeOfDay] ?? null;

  return [...slots].sort((a, b) => {
    if (preferred) {
      const aFit = fitsPreferredBand(a, preferred, constraints.timezone) ? 0 : 1;
      const bFit = fitsPreferredBand(b, preferred, constraints.timezone) ? 0 : 1;
      if (aFit !== bFit) return aFit - bFit;
    }
    return a.start - b.start;
  });
}

function fitsPreferredBand(
  slot: CandidateSlot,
  band: { from: number; to: number },
  timeZone: string,
): boolean {
  const parts = getZonedParts(new Date(slot.start), timeZone);
  const minute = parts.hour * 60 + parts.minute;
  return minute >= band.from && minute < band.to;
}

/** True when `candidate` collides with anything in `busy`. */
export function hasConflict(candidate: Interval, busy: readonly Interval[]): boolean {
  return busy.some((b) => candidate.start < b.end && b.start < candidate.end);
}
