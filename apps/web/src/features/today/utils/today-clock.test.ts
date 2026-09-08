import { describe, expect, it } from 'vitest';

import {
  millisecondsUntilNextClockUpdate,
  millisecondsUntilNextLocalMidnight,
  nextLocalMidnight,
} from './today-clock';

describe('Today local clock rollover', () => {
  it('finds profile-local midnight rather than device or UTC midnight', () => {
    const now = new Date('2026-09-07T03:59:00.000Z');
    const next = nextLocalMidnight(now, 'America/New_York');

    expect(next.toISOString()).toBe('2026-09-07T04:00:00.000Z');
    expect(millisecondsUntilNextLocalMidnight(now, 'America/New_York')).toBe(60_000);
  });

  it('keeps the next midnight correct across a timezone offset change', () => {
    const now = new Date('2026-11-02T05:30:00.000Z');

    expect(nextLocalMidnight(now, 'America/New_York').toISOString()).toBe(
      '2026-11-03T05:00:00.000Z',
    );
  });

  it('refreshes current-time summaries during the day without frequent polling', () => {
    const now = new Date('2026-09-07T15:30:00.000Z');

    expect(millisecondsUntilNextClockUpdate(now, 'America/New_York')).toBe(60_000);
  });

  it('prioritizes the profile-local midnight boundary when it is near', () => {
    const now = new Date('2026-09-07T03:59:30.000Z');

    expect(millisecondsUntilNextClockUpdate(now, 'America/New_York')).toBe(30_050);
  });
});
