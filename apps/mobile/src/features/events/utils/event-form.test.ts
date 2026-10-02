import { CALENDAR_COLORS, toZonedDateKey } from '@cal/domain';
import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  defaultStart,
  eventColorSwatches,
  eventFormFrom,
  mergeDateAndTime,
  newEventForm,
  toEventPayload,
  withStart,
  type EventFormState,
} from './event-form';

const TZ = 'America/New_York';
const CALENDAR_ID = '00000000-0000-4000-8000-000000000001';

function form(overrides: Partial<EventFormState> = {}): EventFormState {
  return {
    title: 'Dentist',
    location: '',
    description: '',
    calendarId: CALENDAR_ID,
    color: null,
    start: new Date('2026-10-05T14:00:00.000Z'),
    end: new Date('2026-10-05T15:00:00.000Z'),
    allDay: false,
    recurrenceRule: null,
    alerts: [10],
    ...overrides,
  };
}

describe('defaultStart', () => {
  it('uses an exact seed as is', () => {
    const seed = new Date('2026-10-05T17:15:00.000Z');

    expect(defaultStart(seed, '2026-10-09', TZ)).toBe(seed);
  });

  it('starts at the next half hour when no day is seeded', () => {
    const now = new Date(2026, 9, 1, 14, 10, 42);

    expect(defaultStart(null, null, TZ, now)).toEqual(new Date(2026, 9, 1, 14, 30, 0, 0));
  });

  it('rolls over to the next hour after half past', () => {
    const now = new Date(2026, 9, 1, 14, 45);

    expect(defaultStart(null, null, TZ, now)).toEqual(new Date(2026, 9, 1, 15, 0, 0, 0));
  });

  it('treats a seeded day that is today like no seed', () => {
    const now = new Date(2026, 9, 1, 14, 10);

    expect(defaultStart(null, toZonedDateKey(now, TZ), TZ, now)).toEqual(
      new Date(2026, 9, 1, 14, 30, 0, 0),
    );
  });

  it('starts a seeded other day at 09:00 in the user time zone', () => {
    const now = new Date('2026-10-01T18:00:00.000Z');

    // 09:00 EDT is 13:00 UTC.
    expect(defaultStart(null, '2026-10-09', TZ, now).toISOString()).toBe(
      '2026-10-09T13:00:00.000Z',
    );
  });
});

describe('newEventForm', () => {
  it('builds a blank form with the default duration and alert', () => {
    const seed = new Date('2026-10-05T14:00:00.000Z');
    const result = newEventForm({
      seedStart: seed,
      seedDateKey: null,
      timeZone: TZ,
      calendarId: CALENDAR_ID,
      durationMinutes: 45,
    });

    expect(result).toEqual({
      title: '',
      location: '',
      description: '',
      calendarId: CALENDAR_ID,
      color: null,
      start: seed,
      end: new Date('2026-10-05T14:45:00.000Z'),
      allDay: false,
      recurrenceRule: null,
      alerts: [10],
    });
  });

  it('gives every new form its own alerts array', () => {
    const options = {
      seedStart: new Date(),
      seedDateKey: null,
      timeZone: TZ,
      calendarId: null,
      durationMinutes: 60,
    };
    const first = newEventForm(options);
    first.alerts.push(30);

    expect(newEventForm(options).alerts).toEqual([10]);
  });
});

describe('eventFormFrom', () => {
  it('maps an existing event and blanks missing text fields', () => {
    const event = {
      id: '00000000-0000-4000-8000-000000000002',
      calendarId: CALENDAR_ID,
      title: 'Standup',
      description: null,
      location: null,
      color: '#FBBE7E',
      startAt: '2026-10-05T13:00:00.000Z',
      endAt: '2026-10-05T13:15:00.000Z',
      allDay: false,
      recurrenceRule: 'FREQ=DAILY',
      alerts: [5],
    } as CalendarEvent;

    expect(eventFormFrom(event)).toEqual({
      title: 'Standup',
      location: '',
      description: '',
      calendarId: CALENDAR_ID,
      color: '#FBBE7E',
      start: new Date('2026-10-05T13:00:00.000Z'),
      end: new Date('2026-10-05T13:15:00.000Z'),
      allDay: false,
      recurrenceRule: 'FREQ=DAILY',
      alerts: [5],
    });
  });
});

describe('mergeDateAndTime', () => {
  it('takes the day from one instant and the wall-clock time from the other', () => {
    const day = new Date('2026-10-09T03:00:00.000Z'); // Oct 8, 23:00 in New York
    const time = new Date('2026-10-01T14:30:00.000Z'); // 10:30 in New York

    expect(mergeDateAndTime(day, time, TZ).toISOString()).toBe('2026-10-08T14:30:00.000Z');
  });

  it('keeps the wall-clock time across a daylight-saving change', () => {
    const day = new Date('2026-11-02T17:00:00.000Z'); // after DST ends (EST)
    const time = new Date('2026-10-01T13:00:00.000Z'); // 09:00 EDT

    expect(mergeDateAndTime(day, time, TZ).toISOString()).toBe('2026-11-02T14:00:00.000Z');
  });
});

describe('withStart', () => {
  it('moves the end with the start, keeping the duration', () => {
    const next = withStart(form(), new Date('2026-10-06T09:00:00.000Z'));

    expect(next).toEqual({
      start: new Date('2026-10-06T09:00:00.000Z'),
      end: new Date('2026-10-06T10:00:00.000Z'),
    });
  });

  it('collapses a negative duration to zero rather than inverting it', () => {
    const inverted = form({ end: new Date('2026-10-05T13:00:00.000Z') });
    const next = withStart(inverted, new Date('2026-10-06T09:00:00.000Z'));

    expect(next.end).toEqual(next.start);
  });
});

describe('eventColorSwatches', () => {
  it('is the palette when the colour is inherited or in the palette', () => {
    expect(eventColorSwatches(null)).toBe(CALENDAR_COLORS);
    expect(eventColorSwatches(CALENDAR_COLORS[0]?.value ?? null)).toBe(CALENDAR_COLORS);
  });

  it('appends an off-palette colour so it stays visible', () => {
    const swatches = eventColorSwatches('#123456');

    expect(swatches).toHaveLength(CALENDAR_COLORS.length + 1);
    expect(swatches.at(-1)).toEqual({ label: 'Current', value: '#123456' });
  });
});

describe('toEventPayload', () => {
  it('trims text and turns empty optional fields into null', () => {
    const result = toEventPayload(
      form({ title: '  Dentist  ', location: '   ', description: ' Bring forms ' }),
      TZ,
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        calendarId: CALENDAR_ID,
        title: 'Dentist',
        description: 'Bring forms',
        location: null,
        color: null,
        startAt: '2026-10-05T14:00:00.000Z',
        endAt: '2026-10-05T15:00:00.000Z',
        allDay: false,
        timezone: TZ,
        recurrenceRule: null,
        alerts: [10],
      },
    });
  });

  it('requires a title', () => {
    expect(toEventPayload(form({ title: '   ' }), TZ)).toEqual({
      ok: false,
      error: 'Give the event a title',
    });
  });

  it('requires a calendar', () => {
    expect(toEventPayload(form({ calendarId: null }), TZ)).toEqual({
      ok: false,
      error: 'Pick a calendar first',
    });
  });

  it('rejects an event that ends before it starts', () => {
    expect(toEventPayload(form({ end: new Date('2026-10-05T13:59:00.000Z') }), TZ)).toEqual({
      ok: false,
      error: 'The event ends before it starts',
    });
  });

  it('allows a zero-length event', () => {
    const start = new Date('2026-10-05T14:00:00.000Z');

    expect(toEventPayload(form({ start, end: start }), TZ).ok).toBe(true);
  });
});
