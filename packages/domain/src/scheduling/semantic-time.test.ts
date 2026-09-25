import { describe, expect, it } from 'vitest';

import { generateCandidateSlots } from './availability.ts';
import { generateIntentReadback } from './intent-resolution.ts';
import {
  OCCASION_WINDOWS,
  TIME_OF_DAY_WINDOWS,
  intersectWindows,
  resolveSemanticTimeWindow,
  semanticWindowOutsideHoursQuestion,
} from './semantic-time.ts';

const at = (hour: number, minute = 0) => hour * 60 + minute;

describe('semantic time windows', () => {
  it('pins the centralized default windows', () => {
    expect(OCCASION_WINDOWS).toEqual({
      breakfast: { earliestMinute: at(7), latestMinute: at(10, 30) },
      brunch: { earliestMinute: at(10), latestMinute: at(14) },
      lunch: { earliestMinute: at(11, 30), latestMinute: at(14) },
      dinner: { earliestMinute: at(17), latestMinute: at(21, 30) },
      drinks: { earliestMinute: at(16), latestMinute: at(23) },
    });
    expect(TIME_OF_DAY_WINDOWS).toEqual({
      morning: { earliestMinute: at(5), latestMinute: at(12) },
      afternoon: { earliestMinute: at(12), latestMinute: at(17) },
      evening: { earliestMinute: at(17), latestMinute: at(22) },
    });
  });

  it('maps an occasion with no clock time to its window', () => {
    expect(resolveSemanticTimeWindow({ type: 'unconstrained' }, 'dinner')).toEqual({
      kind: 'window',
      label: 'Dinner',
      earliestMinute: at(17),
      latestMinute: at(21, 30),
    });
  });

  it('imposes nothing without an occasion or named part of the day', () => {
    expect(resolveSemanticTimeWindow({ type: 'unconstrained' }, null)).toEqual({ kind: 'none' });
    expect(resolveSemanticTimeWindow({ type: 'unconstrained' }, undefined)).toEqual({
      kind: 'none',
    });
  });

  it.each([
    [{ type: 'exact_time', hour: 15, minute: 0 }],
    [{ type: 'after_time', hour: 13, minute: 0 }],
    [{ type: 'before_time', hour: 12, minute: 0 }],
    [{ type: 'between_times', startHour: 13, startMinute: 0, endHour: 15, endMinute: 0 }],
  ] as const)('lets an explicit clock time win over the occasion: %o', (time) => {
    expect(resolveSemanticTimeWindow(time, 'dinner')).toEqual({ kind: 'none' });
  });

  it('keeps the occasion window for "around" a time inside it', () => {
    expect(
      resolveSemanticTimeWindow({ type: 'around_time', hour: 19, minute: 0 }, 'dinner'),
    ).toMatchObject({ kind: 'window', earliestMinute: at(17), latestMinute: at(21, 30) });
  });

  it('lets "around" a time outside the occasion window win', () => {
    expect(
      resolveSemanticTimeWindow({ type: 'around_time', hour: 16, minute: 0 }, 'lunch'),
    ).toEqual({ kind: 'none' });
  });

  it('turns a named time of day into a hard window', () => {
    expect(resolveSemanticTimeWindow({ type: 'time_of_day', preference: 'morning' }, null)).toEqual(
      { kind: 'window', label: 'Morning', earliestMinute: at(5), latestMinute: at(12) },
    );
  });

  it('intersects a named time of day with an occasion', () => {
    expect(
      resolveSemanticTimeWindow({ type: 'time_of_day', preference: 'evening' }, 'drinks'),
    ).toEqual({
      kind: 'window',
      label: 'Drinks (evening)',
      earliestMinute: at(17),
      latestMinute: at(22),
    });
  });

  it('reports a contradiction instead of choosing one side', () => {
    expect(
      resolveSemanticTimeWindow({ type: 'time_of_day', preference: 'evening' }, 'breakfast'),
    ).toEqual({ kind: 'contradictory', label: 'Breakfast (evening)' });
  });

  it('intersects windows and returns null for no overlap', () => {
    const nineToFive = { earliestMinute: at(9), latestMinute: at(17) };
    expect(intersectWindows(OCCASION_WINDOWS.lunch, nineToFive)).toEqual(OCCASION_WINDOWS.lunch);
    expect(intersectWindows(OCCASION_WINDOWS.breakfast, nineToFive)).toEqual({
      earliestMinute: at(9),
      latestMinute: at(10, 30),
    });
    expect(intersectWindows(OCCASION_WINDOWS.dinner, nineToFive)).toBeNull();
  });

  it('phrases the outside-hours question from the window itself', () => {
    expect(
      semanticWindowOutsideHoursQuestion({ label: 'Drinks', ...OCCASION_WINDOWS.drinks }),
    ).toBe(
      'Drinks usually falls between 4:00 PM and 11:00 PM, which is outside your scheduling hours. ' +
        'Name a specific day and time, or adjust your scheduling hours.',
    );
  });
});

describe('semantic windows in candidate generation', () => {
  // Wednesday 2026-09-09 in New York, 09:00-17:00 working hours.
  const baseConstraints = {
    durationMinutes: 60,
    windowStart: '2026-09-09T04:00:00.000Z',
    windowEnd: '2026-09-10T04:00:00.000Z',
    workingHours: [{ weekday: 3, startMinute: at(9), endMinute: at(17) }],
    timezone: 'America/New_York',
    bufferMinutes: 0,
    granularityMinutes: 15,
    splittable: false,
    minSplitMinutes: 30,
    preferredTimeOfDay: 'any' as const,
  };

  it('generates no dinner candidates at all inside 9-5 hours, so no 2-4 PM slot', () => {
    const slots = generateCandidateSlots({
      constraints: { ...baseConstraints, ...OCCASION_WINDOWS.dinner },
      busy: [],
    });
    expect(slots).toEqual([]);
  });

  it('confines lunch candidates to the lunch part of 9-5', () => {
    const slots = generateCandidateSlots({
      constraints: { ...baseConstraints, ...OCCASION_WINDOWS.lunch },
      busy: [],
    });
    // 11:30, 11:45, ... 13:00 starts for one hour, in EDT (UTC-4).
    expect(slots.map((slot) => new Date(slot.start).toISOString())).toEqual([
      '2026-09-09T15:30:00.000Z',
      '2026-09-09T15:45:00.000Z',
      '2026-09-09T16:00:00.000Z',
      '2026-09-09T16:15:00.000Z',
      '2026-09-09T16:30:00.000Z',
      '2026-09-09T16:45:00.000Z',
      '2026-09-09T17:00:00.000Z',
    ]);
  });
});

describe('semantic readback', () => {
  const base = {
    title: 'Dinner with Andrew',
    duration: null,
    date: { type: 'tomorrow' as const },
    location: null,
    description: null,
    requiresClarification: false,
    clarificationQuestion: null,
  };

  it('labels an occasion with no clock time', () => {
    expect(
      generateIntentReadback({ ...base, time: { type: 'unconstrained' }, occasion: 'dinner' })
        .timeLabel,
    ).toBe('Dinner');
  });

  it('shows the explicit time alongside the occasion', () => {
    expect(
      generateIntentReadback({
        ...base,
        time: { type: 'exact_time', hour: 15, minute: 0 },
        occasion: 'dinner',
      }).timeLabel,
    ).toBe('Dinner · At 3:00 PM');
  });

  it('is unchanged for intents persisted before occasions existed', () => {
    expect(generateIntentReadback({ ...base, time: { type: 'unconstrained' } }).timeLabel).toBe(
      null,
    );
  });
});
