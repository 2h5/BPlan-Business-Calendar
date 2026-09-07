import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { eventInputFromForm, eventToFormValues } from './event-form';

const EVENT: CalendarEvent = {
  id: 'a0000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  calendarId: 'b0000000-0000-0000-0000-000000000001',
  title: 'Planning session',
  description: null,
  location: null,
  startAt: '2026-03-07T14:00:00.000Z',
  endAt: '2026-03-07T15:00:00.000Z',
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
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
};

describe('event editor conversion', () => {
  it('round-trips timed wall-clock fields through the shared timezone helpers', () => {
    const form = eventToFormValues(EVENT, 'America/New_York');
    expect(form.startDate).toBe('2026-03-07');
    expect(form.startTime).toBe('09:00');
    expect(eventInputFromForm(form, 'America/New_York')).toMatchObject({
      startAt: EVENT.startAt,
      endAt: EVENT.endAt,
      allDay: false,
    });
  });

  it('stores all-day end dates as an exclusive local midnight across DST', () => {
    const input = eventInputFromForm(
      {
        ...eventToFormValues(EVENT, 'America/New_York'),
        allDay: true,
        startDate: '2026-03-08',
        endDate: '2026-03-09',
      },
      'America/New_York',
    );

    expect(input.startAt).toBe('2026-03-08T05:00:00.000Z');
    expect(input.endAt).toBe('2026-03-10T04:00:00.000Z');
  });

  it('preserves supported recurrence and rejects unsupported rules', () => {
    const form = {
      ...eventToFormValues(EVENT, 'America/New_York'),
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    };
    expect(eventInputFromForm(form, 'America/New_York').recurrenceRule).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    );
    expect(() =>
      eventInputFromForm({ ...form, recurrenceRule: 'FREQ=HOURLY' }, 'America/New_York'),
    ).toThrow('supported repeat pattern');
  });

  it('rejects zero-length and backwards events before the API call', () => {
    const form = eventToFormValues(EVENT, 'America/New_York');
    expect(() =>
      eventInputFromForm({ ...form, endTime: form.startTime }, 'America/New_York'),
    ).toThrow('end after');
  });
});
