import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { buildCalendarOccurrences } from './calendar-occurrences';
import { windowForView } from './calendar-window';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const CALENDAR_ID = '22222222-2222-2222-2222-222222222222';

const calendar: Calendar = {
  id: CALENDAR_ID,
  userId: USER_ID,
  name: 'Personal',
  color: '#6E8BFF',
  sourceType: 'internal',
  providerAccountId: null,
  providerCalendarId: null,
  isVisible: true,
  isDefault: true,
  isReadOnly: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    userId: USER_ID,
    calendarId: CALENDAR_ID,
    title: 'Morning focus',
    description: null,
    location: null,
    startAt: '2026-09-01T13:00:00.000Z',
    endAt: '2026-09-01T14:00:00.000Z',
    allDay: false,
    timezone: 'America/New_York',
    status: 'confirmed',
    recurrenceRule: null,
    alerts: [],
    sourceType: 'internal',
    providerEventId: null,
    recurringEventId: null,
    recurrenceOriginalStartAt: null,
    providerEtag: null,
    providerUpdatedAt: null,
    syncStatus: 'synced',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('web calendar occurrence preparation', () => {
  const timeZone = 'America/New_York';
  const window = windowForView('week', '2026-09-01', timeZone, 1);

  it('uses shared domain recurrence expansion', () => {
    const result = buildCalendarOccurrences(
      [event({ recurrenceRule: 'FREQ=DAILY;COUNT=3' })],
      [calendar],
      window,
      timeZone,
      {},
    );

    expect(result.occurrences).toHaveLength(3);
    expect(result.occurrences.map((item) => item.occurrenceIndex)).toEqual([0, 1, 2]);
    expect(result.byDateKey.get('2026-09-03')).toHaveLength(1);
  });

  it('honors persisted and per-view hidden calendar state', () => {
    const hiddenCalendar = { ...calendar, isVisible: false };
    expect(
      buildCalendarOccurrences([event()], [hiddenCalendar], window, timeZone, {}).occurrences,
    ).toHaveLength(0);
    expect(
      buildCalendarOccurrences([event()], [calendar], window, timeZone, {
        [CALENDAR_ID]: false,
      }).occurrences,
    ).toHaveLength(0);
  });

  it('buckets a multi-day all-day event into every local date it touches', () => {
    const result = buildCalendarOccurrences(
      [
        event({
          allDay: true,
          startAt: '2026-09-02T04:00:00.000Z',
          endAt: '2026-09-04T04:00:00.000Z',
        }),
      ],
      [calendar],
      window,
      timeZone,
      {},
    );

    expect(result.byDateKey.get('2026-09-02')).toHaveLength(1);
    expect(result.byDateKey.get('2026-09-03')).toHaveLength(1);
    expect(result.byDateKey.get('2026-09-04')).toHaveLength(0);
  });
});
