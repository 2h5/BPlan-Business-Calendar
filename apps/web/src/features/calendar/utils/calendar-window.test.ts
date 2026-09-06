import { describe, expect, it } from 'vitest';

import { formatRangeHeading, shiftDateKey, windowForView } from './calendar-window';

describe('web calendar windows', () => {
  const timeZone = 'America/New_York';

  it('builds a Monday-first week in the user timezone', () => {
    const window = windowForView('week', '2026-09-06', timeZone, 1);

    expect(window.dateKeys).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(formatRangeHeading('week', '2026-09-06', window, timeZone)).toBe('Aug 31 – Sep 6, 2026');
  });

  it('uses six complete weeks for a month read', () => {
    const window = windowForView('month', '2026-09-15', timeZone, 1);

    expect(window.dateKeys).toHaveLength(42);
    expect(window.dateKeys[0]).toBe('2026-08-31');
    expect(window.dateKeys[41]).toBe('2026-10-11');
  });

  it('keeps local midnights intact across daylight-saving changes', () => {
    const window = windowForView('week', '2026-11-01', timeZone, 0);

    expect(window.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-11-08T05:00:00.000Z');
    expect(window.dateKeys).toHaveLength(7);
  });

  it('clamps month navigation to the destination month', () => {
    expect(shiftDateKey('2027-01-31', 'month', 1, timeZone)).toBe('2027-02-28');
    expect(shiftDateKey('2027-03-31', 'month', -1, timeZone)).toBe('2027-02-28');
  });
});
