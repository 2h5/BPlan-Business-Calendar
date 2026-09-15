import type { ScheduleConstraints, WorkingHours } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { generateCandidateSlots, type CandidateSlot, type AvailabilityInput } from './availability';
import type { Interval } from '../time/interval';
import { addZonedDays, getZonedParts, zonedWallClockToUtc } from '../time/timezone';

const SEED = 0x5eed_c0de;
const CASE_COUNT = 96;
const MINUTE_MS = 60_000;
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

const DATE_ANCHORS = [
  '2026-01-31',
  '2024-02-28',
  '2026-03-08',
  '2026-03-29',
  '2026-04-05',
  '2026-10-04',
  '2026-10-25',
  '2026-11-01',
  '2026-12-31',
] as const;

const DURATION_SETS = [[15], [30, 60], [15, 45, 90], [30, 45, 60, 90]] as const;

const GRANULARITIES = [5, 7, 15, 30, 45, 60] as const;

const WORKING_HOUR_SHAPES: WorkingHours[] = [
  WEEKDAYS.flatMap((weekday) => [{ weekday, startMinute: 9 * 60, endMinute: 17 * 60 }]),
  ALL_WEEKDAYS.flatMap((weekday) => [
    { weekday, startMinute: 9 * 60 + 15, endMinute: 10 * 60 + 45 },
  ]),
  WEEKDAYS.flatMap((weekday) => [
    { weekday, startMinute: 9 * 60, endMinute: 11 * 60 },
    { weekday, startMinute: 13 * 60 + 30, endMinute: 16 * 60 + 45 },
  ]),
  WEEKDAYS.flatMap((weekday) => [{ weekday, startMinute: 9 * 60 + 7, endMinute: 11 * 60 + 52 }]),
  ALL_WEEKDAYS.flatMap((weekday) => [{ weekday, startMinute: 22 * 60 + 30, endMinute: 1_440 }]),
  [],
];

interface RandomSource {
  next(): number;
  int(min: number, maxInclusive: number): number;
}

function randomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next() {
      state = (state * 1_664_525 + 1_013_904_223) >>> 0;
      return state / 0x1_0000_0000;
    },
    int(min, maxInclusive) {
      return min + Math.floor(this.next() * (maxInclusive - min + 1));
    },
  };
}

function pick<T>(random: RandomSource, values: readonly T[]): T {
  return values[random.int(0, values.length - 1)] as T;
}

function localDateStart(date: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid test date: ${date}`);
  return zonedWallClockToUtc(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    },
    timeZone,
  );
}

function localTime(
  date: string,
  timeZone: string,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid test date: ${date}`);
  return zonedWallClockToUtc(
    {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour,
      minute,
      second,
      millisecond,
    },
    timeZone,
  );
}

function buildBusyIntervals(
  random: RandomSource,
  input: AvailabilityInput,
  dayStart: Date,
  caseIndex: number,
): Interval[] {
  const windowStart = new Date(input.constraints.windowStart).getTime();
  const windowEnd = new Date(input.constraints.windowEnd).getTime();
  const span = windowEnd - windowStart;
  const durations = [0, 5, 15, 30, 45, 60, 90, 180].map((minutes) => minutes * MINUTE_MS);
  const busy: Interval[] = [];

  // Explicit boundary-touching events keep the half-open contract exercised
  // even when the random intervals happen not to land on a boundary.
  if (caseIndex % 3 === 0) {
    busy.push(
      { start: windowStart - 30 * MINUTE_MS, end: windowStart },
      { start: windowEnd, end: windowEnd + 30 * MINUTE_MS },
    );
  }

  // A point event around local midnight exercises the empty-event/buffer rule
  // and gives the recurrence-independent harness a cross-day busy interval.
  if (caseIndex % 7 === 0) {
    busy.push({
      start: dayStart.getTime() - 30 * MINUTE_MS,
      end: dayStart.getTime() + 90 * MINUTE_MS,
    });
  }

  for (let index = 0; index < random.int(0, 7); index += 1) {
    const offset = Math.floor((random.next() * 1.35 - 0.2) * span);
    const start = windowStart + offset;
    const end = start + pick(random, durations);
    busy.push({ start, end });
  }

  return busy;
}

function wallClockBoundary(
  date: { year: number; month: number; day: number },
  minute: number,
  timeZone: string,
): number {
  return zonedWallClockToUtc(
    {
      ...date,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
    },
    timeZone,
  ).getTime();
}

function isWithinConfiguredWindow(slot: CandidateSlot, constraints: ScheduleConstraints): boolean {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const startParts = getZonedParts(start, constraints.timezone);
  const endParts = getZonedParts(end, constraints.timezone);

  return constraints.workingHours.some((workingWindow) => {
    if (workingWindow.weekday !== startParts.weekday) return false;

    const date = {
      year: startParts.year,
      month: startParts.month,
      day: startParts.day,
    };
    const configuredStart = wallClockBoundary(
      date,
      workingWindow.startMinute,
      constraints.timezone,
    );
    const configuredEnd = wallClockBoundary(date, workingWindow.endMinute, constraints.timezone);
    const requestStart = new Date(constraints.windowStart).getTime();
    const requestEnd = new Date(constraints.windowEnd).getTime();

    // Read the end date so this check cannot accidentally bless a slot that
    // crossed an unsupported overnight working window.
    const staysOnConfiguredDate =
      workingWindow.endMinute === 1_440 ||
      (endParts.year === startParts.year &&
        endParts.month === startParts.month &&
        endParts.day === startParts.day);

    return (
      staysOnConfiguredDate &&
      slot.start >= Math.max(configuredStart, requestStart) &&
      slot.end <= Math.min(configuredEnd, requestEnd)
    );
  });
}

function isWithinMinuteBand(slot: CandidateSlot, constraints: ScheduleConstraints): boolean {
  const parts = getZonedParts(new Date(slot.start), constraints.timezone);
  const date = { year: parts.year, month: parts.month, day: parts.day };
  const lower =
    constraints.earliestMinute === undefined
      ? Number.NEGATIVE_INFINITY
      : wallClockBoundary(date, constraints.earliestMinute, constraints.timezone);
  const upper =
    constraints.latestMinute === undefined
      ? Number.POSITIVE_INFINITY
      : wallClockBoundary(date, constraints.latestMinute, constraints.timezone);
  return slot.start >= lower && slot.end <= upper;
}

function overlapsBuffered(slot: CandidateSlot, busy: readonly Interval[], bufferMinutes: number) {
  const buffer = bufferMinutes * MINUTE_MS;
  return busy.some(
    (interval) => slot.start < interval.end + buffer && interval.start - buffer < slot.end,
  );
}

function assertCase(condition: boolean, caseIndex: number, message: string): void {
  if (!condition) {
    throw new Error(`[availability adversarial] seed=${SEED} case=${caseIndex}: ${message}`);
  }
}

describe('generated availability invariants', () => {
  it('holds across a bounded, reproducible timezone/date/window/busy matrix', () => {
    const random = randomSource(SEED);

    for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
      const timeZone = TIMEZONES[caseIndex % TIMEZONES.length] as string;
      const date = pick(random, DATE_ANCHORS);
      const dayStart = localDateStart(date, timeZone);
      const dayCount = random.int(1, 4);
      const windowStart = localTime(
        date,
        timeZone,
        pick(random, [0, 6, 7, 8]),
        pick(random, [0, 7, 13]),
        pick(random, [0, 23]),
        pick(random, [0, 456]),
      );
      const windowEnd = addZonedDays(dayStart, dayCount, timeZone);
      const allowedDurations: number[] = [...pick(random, DURATION_SETS)];
      const earliestMinute = caseIndex % 4 === 0 ? 8 * 60 + 5 : undefined;
      const latestMinute = caseIndex % 4 === 0 ? 18 * 60 + 10 : undefined;
      const constraints: ScheduleConstraints = {
        durationMinutes: allowedDurations[0] as number,
        allowedDurationsMinutes: allowedDurations,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        workingHours: WORKING_HOUR_SHAPES[caseIndex % WORKING_HOUR_SHAPES.length] as WorkingHours,
        timezone: timeZone,
        bufferMinutes: pick(random, [0, 5, 15, 30]),
        earliestMinute,
        latestMinute,
        granularityMinutes: pick(random, GRANULARITIES),
        splittable: false,
        minSplitMinutes: 30,
        preferredTimeOfDay: 'any',
      };
      const input = { constraints, busy: [] as Interval[] };
      input.busy = buildBusyIntervals(random, input, dayStart, caseIndex);

      const slots = generateCandidateSlots(input);
      const identities = new Set<string>();
      const candidateIds = new Set<string>();
      let previous: CandidateSlot | undefined;

      for (const slot of slots) {
        const identity = `${slot.start}/${slot.end}`;
        assertCase(!identities.has(identity), caseIndex, `duplicate candidate ${identity}`);
        identities.add(identity);
        assertCase(!candidateIds.has(slot.id), caseIndex, `duplicate candidate id ${slot.id}`);
        candidateIds.add(slot.id);

        assertCase(slot.start < slot.end, caseIndex, 'candidate is not a positive interval');
        assertCase(
          allowedDurations.includes((slot.end - slot.start) / MINUTE_MS),
          caseIndex,
          `duration ${(slot.end - slot.start) / MINUTE_MS} is not allowed`,
        );
        assertCase(
          slot.start >= new Date(constraints.windowStart).getTime() &&
            slot.end <= new Date(constraints.windowEnd).getTime(),
          caseIndex,
          'candidate escaped the request window',
        );
        assertCase(
          isWithinConfiguredWindow(slot, constraints),
          caseIndex,
          `candidate ${new Date(slot.start).toISOString()} escaped working hours`,
        );
        assertCase(
          isWithinMinuteBand(slot, constraints),
          caseIndex,
          `candidate ${new Date(slot.start).toISOString()} escaped the local minute band`,
        );
        assertCase(
          !overlapsBuffered(slot, input.busy, constraints.bufferMinutes),
          caseIndex,
          `candidate ${new Date(slot.start).toISOString()} overlaps buffered busy time`,
        );

        const local = getZonedParts(new Date(slot.start), timeZone);
        assertCase(
          local.minute % constraints.granularityMinutes === 0 &&
            local.second === 0 &&
            new Date(slot.start).getMilliseconds() === 0,
          caseIndex,
          `candidate ${new Date(slot.start).toISOString()} is off the local grid`,
        );

        if (previous) {
          assertCase(
            previous.start < slot.start ||
              (previous.start === slot.start && previous.end <= slot.end),
            caseIndex,
            'candidates are not chronologically ordered',
          );
        }
        previous = slot;
      }

      // The same input is intentionally run twice: the engine is pure and the
      // generated harness must never depend on wall-clock state or iteration
      // order of the busy input.
      const repeated = generateCandidateSlots({
        constraints,
        busy: [...input.busy].reverse(),
      });
      expect(
        repeated.map((slot) => `${slot.id}/${slot.start}/${slot.end}`),
        `seed=${SEED} case=${caseIndex}`,
      ).toEqual(slots.map((slot) => `${slot.id}/${slot.start}/${slot.end}`));
    }
  });
});

describe('DST adversarial availability cases', () => {
  const springCases = [
    { timeZone: 'America/New_York', date: '2026-03-08', expectedUtc: '2026-03-08T07:30:00.000Z' },
    { timeZone: 'Europe/Berlin', date: '2026-03-29', expectedUtc: '2026-03-29T01:30:00.000Z' },
  ] as const;

  it.each(springCases)('resolves $timeZone spring gaps to the later valid wall time', (fixture) => {
    const converted = zonedWallClockToUtc(
      {
        year: Number(fixture.date.slice(0, 4)),
        month: Number(fixture.date.slice(5, 7)),
        day: Number(fixture.date.slice(8, 10)),
        hour: 2,
        minute: 30,
      },
      fixture.timeZone,
    );

    expect(converted.toISOString()).toBe(fixture.expectedUtc);
    expect(getZonedParts(converted, fixture.timeZone)).toMatchObject({ hour: 3, minute: 30 });
  });

  it.each(springCases)('does not create a slot for a nonexistent exact local time', (fixture) => {
    const dayStart = localDateStart(fixture.date, fixture.timeZone);
    const dayEnd = addZonedDays(dayStart, 1, fixture.timeZone);
    const weekday = getZonedParts(dayStart, fixture.timeZone).weekday;
    const slots = generateCandidateSlots({
      constraints: {
        durationMinutes: 30,
        windowStart: dayStart.toISOString(),
        windowEnd: dayEnd.toISOString(),
        workingHours: [{ weekday, startMinute: 60, endMinute: 4 * 60 }],
        timezone: fixture.timeZone,
        bufferMinutes: 0,
        exactStartMinute: 2 * 60 + 30,
        granularityMinutes: 15,
        splittable: false,
        minSplitMinutes: 30,
        preferredTimeOfDay: 'any',
      },
      busy: [],
    });

    expect(slots).toEqual([]);
  });

  const fallCases = [
    {
      timeZone: 'America/New_York',
      date: '2026-11-01',
      hour: 1,
      expectedUtc: '2026-11-01T05:30:00.000Z',
    },
    {
      timeZone: 'Europe/Berlin',
      date: '2026-10-25',
      hour: 2,
      expectedUtc: '2026-10-25T00:30:00.000Z',
    },
  ] as const;

  it.each(fallCases)('uses the earlier instant for $timeZone ambiguous exact time', (fixture) => {
    const converted = zonedWallClockToUtc(
      {
        year: Number(fixture.date.slice(0, 4)),
        month: Number(fixture.date.slice(5, 7)),
        day: Number(fixture.date.slice(8, 10)),
        hour: fixture.hour,
        minute: 30,
      },
      fixture.timeZone,
    );

    expect(converted.toISOString()).toBe(fixture.expectedUtc);
  });

  it.each(fallCases)('does not duplicate local grid labels on $timeZone fall-back', (fixture) => {
    const dayStart = localDateStart(fixture.date, fixture.timeZone);
    const dayEnd = addZonedDays(dayStart, 1, fixture.timeZone);
    const weekday = getZonedParts(dayStart, fixture.timeZone).weekday;
    const slots = generateCandidateSlots({
      constraints: {
        durationMinutes: 15,
        windowStart: dayStart.toISOString(),
        windowEnd: dayEnd.toISOString(),
        workingHours: [{ weekday, startMinute: 0, endMinute: 4 * 60 }],
        timezone: fixture.timeZone,
        bufferMinutes: 0,
        granularityMinutes: 15,
        splittable: false,
        minSplitMinutes: 30,
        preferredTimeOfDay: 'any',
      },
      busy: [],
    });
    const labels = slots.map((slot) => {
      const parts = getZonedParts(new Date(slot.start), fixture.timeZone);
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
    });

    expect(new Set(labels).size).toBe(labels.length);
    expect(slots.some((slot) => slot.start === Date.parse(fixture.expectedUtc))).toBe(true);
  });
});
