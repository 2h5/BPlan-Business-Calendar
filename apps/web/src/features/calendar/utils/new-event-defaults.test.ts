import { describe, expect, it } from 'vitest';

import { getNewEventSlotDefaults } from './new-event-defaults';

describe('new event slot defaults', () => {
  it('rounds the current wall-clock time up to the next quarter hour', () => {
    expect(
      getNewEventSlotDefaults(new Date('2026-09-17T23:07:20.000Z'), 'America/New_York', 60),
    ).toEqual({
      dateKey: '2026-09-17',
      startMinute: 19 * 60 + 15,
      endMinute: 20 * 60 + 15,
      startTime: '19:15',
      endTime: '20:15',
    });
  });

  it('keeps an exact quarter-hour when there are no elapsed seconds', () => {
    expect(
      getNewEventSlotDefaults(new Date('2026-09-17T23:15:00.000Z'), 'America/New_York', 30),
    ).toMatchObject({
      dateKey: '2026-09-17',
      startMinute: 19 * 60 + 15,
      endMinute: 19 * 60 + 45,
    });
  });

  it('moves to midnight tomorrow rather than creating a cross-midnight default', () => {
    expect(
      getNewEventSlotDefaults(new Date('2026-09-18T03:50:00.000Z'), 'America/New_York', 60),
    ).toEqual({
      dateKey: '2026-09-18',
      startMinute: 0,
      endMinute: 60,
      startTime: '00:00',
      endTime: '01:00',
    });
  });
});
