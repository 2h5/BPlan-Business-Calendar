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
      { type: 'weekend', modifier: 'this' },
      tz,
      wednesdayNoon,
    );
    // Saturday 2026-09-12 EDT to Monday 2026-09-14 EDT
    expect(windowStart.toISOString()).toBe('2026-09-12T04:00:00.000Z');
    expect(windowEnd.toISOString()).toBe('2026-09-14T04:00:00.000Z');
  });

  it('resolves "next weekend" from Wednesday to the following weekend', () => {
    const { windowStart, windowEnd } = resolveIntentDateWindow(
      { type: 'weekend', modifier: 'next' },
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
    expect(formatIntentDateLabel({ type: 'weekend', modifier: 'next' })).toBe('Next weekend');
    expect(formatIntentTimeLabel({ type: 'around_time', hour: 14, minute: 0 })).toBe(
      'Around 2:00 PM',
    );
    expect(timeOfDayFromHour(9)).toBe('morning');
    expect(timeOfDayFromHour(14)).toBe('afternoon');
    expect(timeOfDayFromHour(19)).toBe('evening');
  });
});
