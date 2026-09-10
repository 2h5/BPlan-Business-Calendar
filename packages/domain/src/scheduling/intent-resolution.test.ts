import { describe, expect, it } from 'vitest';

import { generateCandidateSlots } from './availability.ts';
import {
  formatIntentDateLabel,
  formatIntentDurationLabel,
  formatIntentTimeLabel,
  generateIntentReadback,
  resolveIntentDateWindow,
  resolveIntentDuration,
  resolveIntentTimeBounds,
  timeOfDayFromHour,
} from './intent-resolution.ts';

describe('resolveIntentDuration', () => {
  it('returns default 30 minutes when duration is null', () => {
    const result = resolveIntentDuration(null);
    expect(result.durationMinutes).toBe(30);
    expect(result.allowedDurationsMinutes).toBeUndefined();
  });

  it('resolves exact duration', () => {
    const result = resolveIntentDuration({ type: 'exact', minutes: 45 });
    expect(result.durationMinutes).toBe(45);
    expect(result.allowedDurationsMinutes).toBeUndefined();
  });

  it('resolves approximate duration', () => {
    const result = resolveIntentDuration({ type: 'approximate', minutes: 60 });
    expect(result.durationMinutes).toBe(60);
    expect(result.allowedDurationsMinutes).toBeUndefined();
  });

  it('resolves small duration range into min and max', () => {
    const result = resolveIntentDuration({ type: 'range', minMinutes: 30, maxMinutes: 45 });
    expect(result.durationMinutes).toBe(30);
    expect(result.allowedDurationsMinutes).toEqual([30, 45]);
  });

  it('resolves wide duration range into min, midpoint on 15m grid, and max', () => {
    const result = resolveIntentDuration({ type: 'range', minMinutes: 60, maxMinutes: 120 });
    expect(result.durationMinutes).toBe(60);
    expect(result.allowedDurationsMinutes).toEqual([60, 90, 120]);
  });

  it('resolves 1 to 3 hours range into min, mid, and max', () => {
    const result = resolveIntentDuration({ type: 'range', minMinutes: 60, maxMinutes: 180 });
    expect(result.durationMinutes).toBe(60);
    expect(result.allowedDurationsMinutes).toEqual([60, 120, 180]);
  });
});

describe('resolveIntentDateWindow', () => {
  // 2026-09-09 is Wednesday in America/New_York (weekday: 3)
  const tz = 'America/New_York';
  const wednesdayNoon = new Date('2026-09-09T16:00:00.000Z'); // 12:00 EDT

  it('resolves unconstrained to 7-day horizon starting now', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'unconstrained' },
      tz,
      wednesdayNoon,
    );
    expect(windowStart.toISOString()).toBe(wednesdayNoon.toISOString());
    // 7 days later: 2026-09-16
    expect(windowEnd.toISOString()).toBe('2026-09-16T16:00:00.000Z');
  });

  it('resolves today to [now, midnight tonight EDT)', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'today' },
      tz,
      wednesdayNoon,
    );
    expect(windowStart.toISOString()).toBe(wednesdayNoon.toISOString());
    // Midnight tonight EDT is 2026-09-10T04:00:00.000Z
    expect(windowEnd.toISOString()).toBe('2026-09-10T04:00:00.000Z');
  });

  it('resolves tomorrow to [midnight tonight EDT, midnight tomorrow EDT)', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'tomorrow' },
      tz,
      wednesdayNoon,
    );
    expect(windowStart.toISOString()).toBe('2026-09-10T04:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-09-11T04:00:00.000Z');
  });

  it('resolves "this Friday" from Wednesday to upcoming Friday (2 days later)', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'weekday', weekday: 'friday', modifier: 'this' },
      tz,
      wednesdayNoon,
    );
    // Friday start EDT: 2026-09-11T04:00:00.000Z
    expect(windowStart.toISOString()).toBe('2026-09-11T04:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-09-12T04:00:00.000Z');
  });

  it('resolves "next Tuesday" from Wednesday to Tuesday of following week', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'weekday', weekday: 'tuesday', modifier: 'next' },
      tz,
      wednesdayNoon,
    );
    // Next Tuesday is 2026-09-15
    expect(windowStart.toISOString()).toBe('2026-09-15T04:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-09-16T04:00:00.000Z');
  });

  it('resolves "this weekend" from Wednesday to Saturday–Sunday', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'weekend', modifier: 'this', preference: 'any' },
      tz,
      wednesdayNoon,
    );
    // Saturday 2026-09-12 EDT to Monday 2026-09-14 EDT
    expect(windowStart.toISOString()).toBe('2026-09-12T04:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-09-14T04:00:00.000Z');
  });

  it('resolves "next weekend" from Wednesday to the following weekend', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'weekend', modifier: 'next', preference: 'any' },
      tz,
      wednesdayNoon,
    );
    expect(windowStart.toISOString()).toBe('2026-09-19T04:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-09-21T04:00:00.000Z');
  });

  it('resolves explicit date YYYY-MM-DD in timezone', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'explicit_date', date: '2026-10-15' },
      tz,
      wednesdayNoon,
    );
    expect(windowStart.toISOString()).toBe('2026-10-15T04:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-10-16T04:00:00.000Z');
  });
});

describe('resolveIntentTimeBounds', () => {
  it('handles unconstrained', () => {
    const result = resolveIntentTimeBounds({ type: 'unconstrained' }, 30);
    expect(result.preferredTimeOfDay).toBe('any');
    expect(result.earliestMinute).toBeUndefined();
    expect(result.latestMinute).toBeUndefined();
  });

  it('handles exact time as a hard minute band', () => {
    const result = resolveIntentTimeBounds({ type: 'exact_time', hour: 15, minute: 0 }, 60);
    expect(result.earliestMinute).toBe(15 * 60);
    expect(result.latestMinute).toBe(16 * 60);
    expect(result.preferredTimeOfDay).toBe('afternoon');
  });

  it('handles around time as a soft preference without excluding valid slots', () => {
    const result = resolveIntentTimeBounds({ type: 'around_time', hour: 14, minute: 0 }, 30);
    expect(result.earliestMinute).toBeUndefined();
    expect(result.latestMinute).toBeUndefined();
    expect(result.preferredTimeOfDay).toBe('afternoon');
    expect(result.noteHint).toContain('2:00 PM');
  });

  it('handles after time as a hard lower minute bound', () => {
    const result = resolveIntentTimeBounds({ type: 'after_time', hour: 16, minute: 0 }, 30);
    expect(result.earliestMinute).toBe(16 * 60);
    expect(result.latestMinute).toBeUndefined();
    expect(result.preferredTimeOfDay).toBe('afternoon');
  });

  it('handles before time as a hard upper minute bound', () => {
    const result = resolveIntentTimeBounds({ type: 'before_time', hour: 12, minute: 0 }, 30);
    expect(result.earliestMinute).toBeUndefined();
    expect(result.latestMinute).toBe(12 * 60);
    expect(result.preferredTimeOfDay).toBe('morning');
  });

  it('handles between times as hard lower and upper bounds', () => {
    const result = resolveIntentTimeBounds(
      {
        type: 'between_times',
        startHour: 14,
        startMinute: 0,
        endHour: 17,
        endMinute: 30,
      },
      30,
    );
    expect(result.earliestMinute).toBe(14 * 60);
    expect(result.latestMinute).toBe(17 * 60 + 30);
    expect(result.preferredTimeOfDay).toBe('afternoon');
  });
});

describe('generateCandidateSlots with allowedDurationsMinutes', () => {
  const workingHours = [
    { weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
    { weekday: 2, startMinute: 9 * 60, endMinute: 17 * 60 },
    { weekday: 3, startMinute: 9 * 60, endMinute: 17 * 60 },
    { weekday: 4, startMinute: 9 * 60, endMinute: 17 * 60 },
    { weekday: 5, startMinute: 9 * 60, endMinute: 17 * 60 },
  ];

  it('generates slots across multiple allowed durations', () => {
    const slots = generateCandidateSlots({
      constraints: {
        durationMinutes: 60,
        allowedDurationsMinutes: [60, 120],
        windowStart: '2026-09-09T13:00:00.000Z', // 09:00 EDT
        windowEnd: '2026-09-09T17:00:00.000Z', // 13:00 EDT
        workingHours,
        timezone: 'America/New_York',
        bufferMinutes: 0,
        granularityMinutes: 60,
        splittable: false,
        minSplitMinutes: 30,
        preferredTimeOfDay: 'morning',
      },
      busy: [],
    });

    // Between 09:00 and 13:00 (4 hours), on 60m granularity:
    // 60-min slots: 09:00-10:00, 10:00-11:00, 11:00-12:00, 12:00-13:00 (4 slots)
    // 120-min slots: 09:00-11:00, 10:00-12:00, 11:00-13:00 (3 slots)
    // Total: 7 candidate slots
    expect(slots.length).toBe(7);
    const durations = slots.map((s) => (s.end - s.start) / 60_000);
    expect(durations).toContain(60);
    expect(durations).toContain(120);
    // Slot IDs are numbered 1..7 contiguously
    expect(slots[0]?.id).toBe('slot_1');
    expect(slots[slots.length - 1]?.id).toBe(`slot_${slots.length}`);
  });
});

describe('readback formatting', () => {
  it('generates complete intent readback', () => {
    const readback = generateIntentReadback({
      title: 'Work on resume',
      duration: { type: 'range', minMinutes: 60, maxMinutes: 120 },
      date: { type: 'weekday', weekday: 'saturday', modifier: 'this' },
      time: { type: 'after_time', hour: 14, minute: 0 },
      location: 'Home',
      description: 'Update CV and projects',
      requiresClarification: false,
      clarificationQuestion: null,
    });

    expect(readback).toEqual({
      title: 'Work on resume',
      durationMinutes: 60,
      durationLabel: '1 hr – 2 hrs',
      dateLabel: 'Saturday',
      timeLabel: 'After 2:00 PM',
      location: 'Home',
    });

    expect(formatIntentDurationLabel({ type: 'exact', minutes: 30 })).toBe('30 min');
    expect(formatIntentDurationLabel({ type: 'approximate', minutes: 45 })).toBe('45 min (approx)');
    expect(formatIntentDateLabel({ type: 'tomorrow' })).toBe('Tomorrow');
    expect(formatIntentDateLabel({ type: 'weekend', modifier: 'next', preference: 'any' })).toBe(
      'Next weekend',
    );
    expect(formatIntentDateLabel({ type: 'weekend', modifier: 'this', preference: 'late' })).toBe(
      'End of this weekend',
    );
    expect(formatIntentDateLabel({ type: 'weekend', modifier: 'next', preference: 'early' })).toBe(
      'Early next weekend',
    );
    expect(
      formatIntentDateLabel({ type: 'relative_week', modifier: 'next', preference: 'late' }),
    ).toBe('Later next week');
    expect(
      formatIntentDateLabel({ type: 'relative_week', modifier: 'this', preference: 'early' }),
    ).toBe('Early this week');
    expect(formatIntentTimeLabel({ type: 'around_time', hour: 14, minute: 0 })).toBe(
      'Around 2:00 PM',
    );
    expect(timeOfDayFromHour(9)).toBe('morning');
    expect(timeOfDayFromHour(14)).toBe('afternoon');
    expect(timeOfDayFromHour(19)).toBe('evening');
  });
});

describe('explicit date and calendar validation', () => {
  it('validates calendar dates strictly with round-trip check', async () => {
    const { isValidCalendarDate } = await import('@cal/schemas/scheduling');

    // Valid dates
    expect(isValidCalendarDate('2026-02-28')).toBe(true);
    expect(isValidCalendarDate('2024-02-29')).toBe(true); // 2024 is leap year
    expect(isValidCalendarDate('2026-04-30')).toBe(true);
    expect(isValidCalendarDate('2026-12-31')).toBe(true);

    // Impossible dates that JS Date normally wraps
    expect(isValidCalendarDate('2026-02-29')).toBe(false); // 2026 is not leap year
    expect(isValidCalendarDate('2026-02-30')).toBe(false); // February 30th
    expect(isValidCalendarDate('2026-04-31')).toBe(false); // April has 30 days
    expect(isValidCalendarDate('2026-06-31')).toBe(false); // June has 30 days
    expect(isValidCalendarDate('2026-13-01')).toBe(false); // Month 13
    expect(isValidCalendarDate('2026-00-10')).toBe(false); // Month 0
    expect(isValidCalendarDate('not-a-date')).toBe(false);
  });

  it('flags impossible dates in resolveIntentDateWindow', () => {
    const tz = 'America/New_York';
    const now = new Date('2026-09-09T16:00:00.000Z');
    const result = resolveIntentDateWindow({ type: 'explicit_date', date: '2026-02-30' }, tz, now);
    expect(result.isImpossibleDate).toBe(true);
  });

  it('flags past dates in resolveIntentDateWindow', () => {
    const tz = 'America/New_York';
    const now = new Date('2026-09-09T16:00:00.000Z');
    const result = resolveIntentDateWindow({ type: 'explicit_date', date: '2026-01-15' }, tz, now);
    expect(result.isPast).toBe(true);
  });

  it('handles DST transition dates cleanly', () => {
    const tz = 'America/New_York';
    // Fall back Sunday in 2026: November 1, 2026
    const fallBackDate = '2026-11-01';
    const now = new Date('2026-10-15T12:00:00.000Z');
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'explicit_date', date: fallBackDate },
      tz,
      now,
    );
    // Start of day in NY on 2026-11-01 is 04:00 UTC (EDT UTC-4)
    expect(windowStart.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    // Start of next day in NY on 2026-11-02 is 05:00 UTC (EST UTC-5)
    expect(windowEnd.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    // The day has 25 hours across DST transition
    const diffHours = (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(25);
  });
});

describe('exact time with duration range', () => {
  it('expands latestMinute to accommodate maxDurationMinutes so all candidate durations fit at exact start', () => {
    // User requested "an hour or two at exactly 3pm" (15:00)
    // Duration: range [60, 120] -> allowedDurations: [60, 90, 120]
    // Time: exact_time at 15:00
    const resolved = resolveIntentTimeBounds(
      { type: 'exact_time', hour: 15, minute: 0 },
      60,
      120, // maxDurationMinutes
    );

    // 15:00 = 900 minutes
    expect(resolved.earliestMinute).toBe(900);
    // latestMinute is 15:00 + 120m = 1020 minutes (17:00), NOT clipped at 15:00 + 60m (960)
    expect(resolved.latestMinute).toBe(1020);

    // When candidates are generated with granularity 15 and allowedDurations [60, 90, 120],
    // slots starting at 15:00 for 60m, 90m, and 120m are all generated
    const slots = generateCandidateSlots({
      constraints: {
        durationMinutes: 60,
        allowedDurationsMinutes: [60, 90, 120],
        windowStart: '2026-09-09T12:00:00.000Z',
        windowEnd: '2026-09-09T23:00:00.000Z',
        workingHours: [{ weekday: 3, startMinute: 9 * 60, endMinute: 18 * 60 }],
        timezone: 'America/New_York',
        bufferMinutes: 0,
        earliestMinute: resolved.earliestMinute,
        latestMinute: resolved.latestMinute,
        granularityMinutes: 15,
        splittable: false,
        minSplitMinutes: 30,
        preferredTimeOfDay: 'afternoon',
      },
      busy: [],
    });

    const slotsStartingAt3pm = slots.filter((s) => {
      const d = new Date(s.start);
      // In America/New_York (EDT UTC-4), 15:00 is 19:00 UTC
      return d.getUTCHours() === 19 && d.getUTCMinutes() === 0;
    });

    const candidateDurationsAt3pm = slotsStartingAt3pm.map((s) => (s.end - s.start) / 60_000);
    expect(candidateDurationsAt3pm).toContain(60);
    expect(candidateDurationsAt3pm).toContain(90);
    expect(candidateDurationsAt3pm).toContain(120);
  });
});

describe('richer relative-date preferences', () => {
  const tz = 'America/New_York';
  const wednesdayNoon = new Date('2026-09-09T16:00:00.000Z'); // Wednesday 12:00 EDT

  it('resolves toward the end of this weekend with late placement preference', () => {
    const result = resolveIntentDateWindow(
      { type: 'weekend', modifier: 'this', preference: 'late' },
      tz,
      wednesdayNoon,
    );

    // Upcoming weekend from Wednesday Sept 9 is Saturday Sept 12 to Monday Sept 14
    expect(result.placementPreference).toBe('late');
    // Saturday Sept 12 00:00 EDT = 04:00 UTC
    expect(result.windowStart.toISOString()).toBe('2026-09-12T04:00:00.000Z');
    // Monday Sept 14 00:00 EDT = 04:00 UTC
    expect(result.windowEnd.toISOString()).toBe('2026-09-14T04:00:00.000Z');
  });

  it('resolves early this weekend with early placement preference', () => {
    const result = resolveIntentDateWindow(
      { type: 'weekend', modifier: 'this', preference: 'early' },
      tz,
      wednesdayNoon,
    );

    expect(result.placementPreference).toBe('early');
    expect(result.windowStart.toISOString()).toBe('2026-09-12T04:00:00.000Z');
    expect(result.windowEnd.toISOString()).toBe('2026-09-14T04:00:00.000Z');
  });

  it('resolves sometime next week and later next week', () => {
    const sometimeNextWeek = resolveIntentDateWindow(
      { type: 'relative_week', modifier: 'next', preference: 'any' },
      tz,
      wednesdayNoon,
    );

    // Next Monday from Wednesday Sept 9 is Monday Sept 14
    expect(sometimeNextWeek.windowStart.toISOString()).toBe('2026-09-14T04:00:00.000Z');
    // Following Monday is Monday Sept 21
    expect(sometimeNextWeek.windowEnd.toISOString()).toBe('2026-09-21T04:00:00.000Z');
    expect(sometimeNextWeek.placementPreference).toBe('any');

    const laterNextWeek = resolveIntentDateWindow(
      { type: 'relative_week', modifier: 'next', preference: 'late' },
      tz,
      wednesdayNoon,
    );

    expect(laterNextWeek.windowStart.toISOString()).toBe('2026-09-14T04:00:00.000Z');
    expect(laterNextWeek.windowEnd.toISOString()).toBe('2026-09-21T04:00:00.000Z');
    expect(laterNextWeek.placementPreference).toBe('late');
  });
});
