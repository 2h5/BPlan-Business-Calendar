import type { WorkingHours } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { offHoursBands } from './working-hours-bands';

// 2026-09-25 is a Friday (weekday 5); 2026-09-26 is a Saturday.
const nineToFive: WorkingHours = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));

describe('offHoursBands', () => {
  it('shades before and after a working window', () => {
    expect(offHoursBands('2026-09-25', nineToFive)).toEqual([
      { startMinute: 0, endMinute: 540 },
      { startMinute: 1020, endMinute: 1440 },
    ]);
  });

  it('shades the whole day when it has no working window', () => {
    expect(offHoursBands('2026-09-26', nineToFive)).toEqual([{ startMinute: 0, endMinute: 1440 }]);
  });

  it('does not shade anything when working hours are not configured', () => {
    expect(offHoursBands('2026-09-26', [])).toEqual([]);
  });

  it('merges overlapping windows and handles a window that runs to end of day', () => {
    const split: WorkingHours = [
      { weekday: 5, startMinute: 13 * 60, endMinute: 1440 },
      { weekday: 5, startMinute: 8 * 60, endMinute: 12 * 60 },
      { weekday: 5, startMinute: 11 * 60, endMinute: 12 * 60 },
    ];
    expect(offHoursBands('2026-09-25', split)).toEqual([
      { startMinute: 0, endMinute: 480 },
      { startMinute: 720, endMinute: 780 },
    ]);
  });
});
