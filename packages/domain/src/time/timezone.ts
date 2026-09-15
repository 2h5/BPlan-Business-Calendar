/**
 * Time-zone conversion built on `Intl`, with no external dependency.
 *
 * The whole app stores instants in UTC. Users think in wall-clock time in their
 * own zone. These helpers are the only sanctioned bridge between the two, so
 * that DST bugs have exactly one place to live.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const HOUR_MS = 60 * 60_000;

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Split an instant into wall-clock parts as seen in `timeZone`. */
export function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour) % 24,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    weekday: WEEKDAY_INDEX[lookup.weekday ?? 'Sun'] ?? 0,
  };
}

/**
 * Offset of `timeZone` from UTC at `instant`, in minutes.
 * Positive east of Greenwich (Berlin in summer = +120).
 */
export function getOffsetMinutes(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second precision on both sides before differencing.
  return (asIfUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Convert a wall-clock time in `timeZone` to the instant it refers to.
 *
 * DST edges are resolved the way calendars conventionally do:
 * - "Spring forward" gap (02:30 on a day where 02:00→03:00 never happens):
 *   returns the instant one offset-shift later, i.e. 03:30 local.
 * - "Fall back" overlap (01:30 occurring twice): returns the *first*, earlier
 *   occurrence.
 */
export function zonedWallClockToUtc(
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
  },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  );

  // The offset at the naive instant is not enough around a transition. For
  // example, Berlin's 02:30 spring gap is represented by a naive UTC instant
  // that is already on the daylight side, while New York's equivalent naive
  // instant is still on standard time. Probe on both sides so the same policy
  // works for positive and negative offsets.
  const offsets = new Set([
    getOffsetMinutes(new Date(naive - 4 * HOUR_MS), timeZone),
    getOffsetMinutes(new Date(naive), timeZone),
    getOffsetMinutes(new Date(naive + 4 * HOUR_MS), timeZone),
  ]);
  const candidates = [...offsets].map((offset) => new Date(naive - offset * 60_000));
  const normalized = new Date(naive);

  const exactMatches = candidates.filter((candidate) =>
    sameWallClock(candidate, normalized, timeZone),
  );
  if (exactMatches.length > 0) {
    // A fall-back label has two valid instants. The earlier one is the stable
    // choice shared by the scheduling engine and confirmation predicate.
    return new Date(Math.min(...exactMatches.map((candidate) => candidate.getTime())));
  }

  // A spring-forward label has no exact instant. Choose the first candidate
  // whose round-tripped wall clock is later than the requested label; this is
  // the documented "shift forward by the gap" policy.
  const laterMatches = candidates
    .map((candidate) => ({
      candidate,
      wallClock: wallClockAsUtc(candidate, timeZone),
    }))
    .filter(({ wallClock }) => wallClock > naive)
    .sort(
      (left, right) =>
        left.wallClock - right.wallClock || left.candidate.getTime() - right.candidate.getTime(),
    );
  if (laterMatches[0]) return laterMatches[0].candidate;

  // This fallback is only reachable for an unusual historical zone rule not
  // represented by the probes above. Preserve deterministic behavior rather
  // than returning an arbitrary candidate.
  return candidates.sort((left, right) => left.getTime() - right.getTime())[0] ?? new Date(naive);
}

function sameWallClock(instant: Date, expected: Date, timeZone: string): boolean {
  const actual = getZonedParts(instant, timeZone);
  return (
    actual.year === expected.getUTCFullYear() &&
    actual.month === expected.getUTCMonth() + 1 &&
    actual.day === expected.getUTCDate() &&
    actual.hour === expected.getUTCHours() &&
    actual.minute === expected.getUTCMinutes() &&
    actual.second === expected.getUTCSeconds() &&
    instant.getUTCMilliseconds() === expected.getUTCMilliseconds()
  );
}

function wallClockAsUtc(instant: Date, timeZone: string): number {
  const parts = getZonedParts(instant, timeZone);
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    instant.getUTCMilliseconds(),
  );
}

/** Minutes elapsed since local midnight in `timeZone`. */
export function minuteOfDay(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  return p.hour * 60 + p.minute;
}

/** The instant at which the local day containing `instant` begins. */
export function startOfZonedDay(instant: Date, timeZone: string): Date {
  const p = getZonedParts(instant, timeZone);
  return zonedWallClockToUtc({ year: p.year, month: p.month, day: p.day }, timeZone);
}

/** "2026-08-30" for the local day containing `instant`. */
export function toZonedDateKey(instant: Date, timeZone: string): string {
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Start of the local day `days` after the local day containing `instant`. */
export function addZonedDays(instant: Date, days: number, timeZone: string): Date {
  const p = getZonedParts(instant, timeZone);
  return zonedWallClockToUtc(
    { year: p.year, month: p.month, day: p.day + days, hour: p.hour, minute: p.minute },
    timeZone,
  );
}

/** The device's IANA zone, falling back to UTC where unavailable. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
