import {
  durationIntentSchema,
  type DateIntent,
  type ScheduleConstraints,
} from '@cal/schemas/scheduling';
import { describe, expect, it } from 'vitest';

import { generateCandidateSlots } from './availability';
import {
  resolveEffectiveWorkingHours,
  resolveIntentDateWindow,
  resolveIntentDuration,
  resolveIntentTimeBounds,
} from './intent-resolution';
import { addZonedDays, getZonedParts, toZonedDateKey, zonedWallClockToUtc } from '../time/timezone';

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

function localMidnight(date: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid test date: ${date}`);
  return zonedWallClockToUtc(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) },
    timeZone,
  );
}

function workWeek(startMinute = 9 * 60, endMinute = 17 * 60) {
  return [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute, endMinute }));
}

describe('generated intent-resolution invariants', () => {
  it('keeps every generated duration inside the requested range', () => {
    const ranges = [
      [5, 20],
      [15, 45],
      [30, 31],
      [30, 60],
      [60, 120],
      [105, 255],
      [705, 720],
    ] as const;

    for (const [minMinutes, maxMinutes] of ranges) {
      const resolved = resolveIntentDuration({ type: 'range', minMinutes, maxMinutes });
      const allowed = resolved.allowedDurationsMinutes ?? [];

      expect(allowed.length).toBeGreaterThanOrEqual(2);
      expect(allowed[0]).toBe(minMinutes);
      expect(allowed.at(-1)).toBe(maxMinutes);
      expect(new Set(allowed).size).toBe(allowed.length);
      expect(allowed.every((minutes) => minutes >= minMinutes && minutes <= maxMinutes)).toBe(true);
      expect(allowed.every((minutes) => Number.isInteger(minutes))).toBe(true);
    }
  });

  it('resolves explicit calendar dates to the same local date across every supported zone', () => {
    const dates = ['2026-01-31', '2024-02-29', '2026-03-29', '2026-10-25', '2026-12-31'];
    const now = new Date('2020-01-01T00:00:00.000Z');

    for (const timeZone of TIMEZONES) {
      for (const date of dates) {
        const result = resolveIntentDateWindow({ type: 'explicit_date', date }, timeZone, now);
        const nextDate = addZonedDays(result.windowStart, 1, timeZone);

        expect(toZonedDateKey(result.windowStart, timeZone), `${timeZone} ${date}`).toBe(date);
        expect(toZonedDateKey(result.windowEnd, timeZone), `${timeZone} ${date}`).toBe(
          toZonedDateKey(nextDate, timeZone),
        );
        expect(result.windowEnd.getTime()).toBeGreaterThan(result.windowStart.getTime());
        expect(result.isPast).toBe(false);
      }
    }
  });

  it('keeps UTC-date changes from changing the user local date constraint', () => {
    const now = new Date('2026-09-01T00:30:00.000Z');
    const result = resolveIntentDateWindow({ type: 'today' }, 'America/New_York', now);

    expect(toZonedDateKey(now, 'America/New_York')).toBe('2026-08-31');
    expect(result.windowStart.toISOString()).toBe(now.toISOString());
    expect(toZonedDateKey(result.windowEnd, 'America/New_York')).toBe('2026-09-01');
  });

  it('keeps exact-time duration ranges at one requested local start', () => {
    const timeZone = 'America/New_York';
    const dateIntent: DateIntent = { type: 'explicit_date', date: '2026-09-10' };
    const dateWindow = resolveIntentDateWindow(
      dateIntent,
      timeZone,
      new Date('2026-09-09T16:00:00.000Z'),
    );
    const timeBounds = resolveIntentTimeBounds({ type: 'exact_time', hour: 15, minute: 0 });
    const dayStart = localMidnight('2026-09-10', timeZone);
    const weekday = getZonedParts(dayStart, timeZone).weekday;
    const constraints: ScheduleConstraints = {
      durationMinutes: 60,
      allowedDurationsMinutes: [60, 90, 120],
      windowStart: dateWindow.windowStart.toISOString(),
      windowEnd: dateWindow.windowEnd.toISOString(),
      workingHours: [{ weekday, startMinute: 9 * 60, endMinute: 18 * 60 }],
      timezone: timeZone,
      bufferMinutes: 0,
      exactStartMinute: timeBounds.exactStartMinute,
      granularityMinutes: 15,
      splittable: false,
      minSplitMinutes: 30,
      preferredTimeOfDay: timeBounds.preferredTimeOfDay,
    };
    const slots = generateCandidateSlots({ constraints, busy: [] });
    const expectedStart = zonedWallClockToUtc(
      { year: 2026, month: 9, day: 10, hour: 15, minute: 0 },
      timeZone,
    ).getTime();

    expect(slots.length).toBe(3);
    expect(slots.every((slot) => slot.start === expectedStart)).toBe(true);
    expect(slots.map((slot) => (slot.end - slot.start) / 60_000)).toEqual([60, 90, 120]);
  });

  it('does not slide an exact time that has already elapsed today', () => {
    const timeZone = 'America/New_York';
    const now = new Date('2026-09-09T16:00:00.000Z'); // 12:00 local.
    const result = resolveIntentDateWindow({ type: 'today' }, timeZone, now);
    const bounds = resolveIntentTimeBounds({ type: 'exact_time', hour: 10, minute: 0 });
    const slots = generateCandidateSlots({
      constraints: {
        durationMinutes: 30,
        windowStart: result.windowStart.toISOString(),
        windowEnd: result.windowEnd.toISOString(),
        workingHours: workWeek(),
        timezone: timeZone,
        bufferMinutes: 0,
        exactStartMinute: bounds.exactStartMinute,
        granularityMinutes: 15,
        splittable: false,
        minSplitMinutes: 30,
        preferredTimeOfDay: bounds.preferredTimeOfDay,
      },
      busy: [],
    });

    expect(slots).toEqual([]);
  });
});

describe('adversarial intent combinations', () => {
  it('preserves weekend placement preferences while changing no hard date bounds', () => {
    const now = new Date('2026-09-09T16:00:00.000Z');
    const early = resolveIntentDateWindow(
      { type: 'weekend', modifier: 'this', preference: 'early' },
      'America/New_York',
      now,
    );
    const late = resolveIntentDateWindow(
      { type: 'weekend', modifier: 'this', preference: 'late' },
      'America/New_York',
      now,
    );

    expect(early.windowStart.toISOString()).toBe(late.windowStart.toISOString());
    expect(early.windowEnd.toISOString()).toBe(late.windowEnd.toISOString());
    expect(early.placementPreference).toBe('early');
    expect(late.placementPreference).toBe('late');
  });

  it('resolves weekday requests at the Saturday-to-Sunday boundary', () => {
    const saturday = new Date('2026-09-12T16:00:00.000Z');
    const result = resolveIntentDateWindow(
      { type: 'weekday', weekday: 'sunday', modifier: 'next' },
      'America/New_York',
      saturday,
    );

    expect(toZonedDateKey(result.windowStart, 'America/New_York')).toBe('2026-09-13');
    expect(toZonedDateKey(result.windowEnd, 'America/New_York')).toBe('2026-09-14');
  });

  it('rejects equal duration-range endpoints and flags impossible or past dates', () => {
    expect(
      durationIntentSchema.safeParse({ type: 'range', minMinutes: 60, maxMinutes: 60 }).success,
    ).toBe(false);

    const now = new Date('2026-09-09T16:00:00.000Z');
    expect(
      resolveIntentDateWindow(
        { type: 'explicit_date', date: '2026-02-30' },
        'America/New_York',
        now,
      ).isImpossibleDate,
    ).toBe(true);
    expect(
      resolveIntentDateWindow(
        { type: 'explicit_date', date: '2026-01-15' },
        'America/New_York',
        now,
      ).isPast,
    ).toBe(true);
  });

  it('opens only the named narrow personal-time window for an exact out-of-hours request', () => {
    const result = resolveEffectiveWorkingHours({
      workingHours: workWeek(9 * 60, 17 * 60),
      dateIntent: { type: 'weekday', weekday: 'friday', modifier: 'none' },
      windowStart: new Date('2026-09-11T04:00:00.000Z'),
      windowEnd: new Date('2026-09-12T04:00:00.000Z'),
      timeZone: 'America/New_York',
      exactStartMinute: 20 * 60,
    });

    expect(result).toContainEqual({ weekday: 5, startMinute: 8 * 60, endMinute: 22 * 60 });
    expect(result.filter((window) => window.weekday === 5)).toHaveLength(2);
  });
});
