import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { eventInputFromForm, eventInputWithTiming, eventToFormValues } from './event-form';

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
    const form = eventToFormValues(EVENT);
    expect(form.startDate).toBe('2026-03-07');
    expect(form.startTime).toBe('09:00');
    expect(eventInputFromForm(form, 'America/New_York', EVENT)).toMatchObject({
      startAt: EVENT.startAt,
      endAt: EVENT.endAt,
      allDay: false,
      timezone: EVENT.timezone,
      alerts: [],
    });
  });

  it('keeps an existing event timezone through unrelated edits', () => {
    const event = {
      ...EVENT,
      timezone: 'America/Los_Angeles',
      recurrenceRule: 'FREQ=DAILY;COUNT=3',
      alerts: [15],
    } satisfies CalendarEvent;
    const form = eventToFormValues(event);
    const profileTimeZone = 'America/New_York';

    expect(form.startTime).toBe('06:00');
    expect(profileTimeZone).not.toBe(event.timezone);
    expect(
      eventInputFromForm(
        { ...form, title: 'Renamed session', description: 'New notes', location: 'Room 4' },
        profileTimeZone,
        event,
      ),
    ).toMatchObject({
      title: 'Renamed session',
      description: 'New notes',
      location: 'Room 4',
      startAt: event.startAt,
      endAt: event.endAt,
      timezone: event.timezone,
      recurrenceRule: event.recurrenceRule,
      alerts: event.alerts,
    });
  });

  it('stores all-day end dates as an exclusive local midnight across DST', () => {
    const input = eventInputFromForm(
      {
        ...eventToFormValues(EVENT),
        allDay: true,
        startDate: '2026-03-08',
        endDate: '2026-03-09',
      },
      'America/New_York',
      EVENT,
    );

    expect(input.startAt).toBe('2026-03-08T05:00:00.000Z');
    expect(input.endAt).toBe('2026-03-10T04:00:00.000Z');
  });

  it('preserves supported recurrence and rejects newly entered unsupported rules', () => {
    const form = {
      ...eventToFormValues(EVENT),
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    };
    expect(eventInputFromForm(form, 'America/New_York', EVENT).recurrenceRule).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    );
    expect(() =>
      eventInputFromForm({ ...form, recurrenceRule: 'FREQ=HOURLY' }, 'America/New_York', EVENT),
    ).toThrow('supported repeat pattern');
  });

  it('allows unrelated edits to preserve an unsupported recurrence unchanged', () => {
    const event = {
      ...EVENT,
      sourceType: 'microsoft',
      timezone: 'Europe/Berlin',
      recurrenceRule: 'FREQ=HOURLY;BYMINUTE=15',
      alerts: [60, 1440],
    } satisfies CalendarEvent;
    const form = eventToFormValues(event);

    expect(
      eventInputFromForm(
        { ...form, title: 'Updated provider title', description: 'Keep the provider rule' },
        event.timezone,
        event,
      ),
    ).toMatchObject({
      title: 'Updated provider title',
      description: 'Keep the provider rule',
      location: event.location,
      timezone: event.timezone,
      recurrenceRule: event.recurrenceRule,
      alerts: event.alerts,
    });
  });

  it('rejects zero-length and backwards events before the API call', () => {
    const form = eventToFormValues(EVENT);
    expect(() =>
      eventInputFromForm({ ...form, endTime: form.startTime }, 'America/New_York'),
    ).toThrow('end after');
  });

  it('changes only timing while preserving every editable event field', () => {
    expect(eventInputWithTiming(EVENT, '2026-03-07T13:45:00.000Z', EVENT.endAt)).toEqual({
      calendarId: EVENT.calendarId,
      title: EVENT.title,
      description: EVENT.description,
      location: EVENT.location,
      startAt: '2026-03-07T13:45:00.000Z',
      endAt: EVENT.endAt,
      allDay: EVENT.allDay,
      timezone: EVENT.timezone,
      recurrenceRule: EVENT.recurrenceRule,
      alerts: EVENT.alerts,
    });
  });
});
