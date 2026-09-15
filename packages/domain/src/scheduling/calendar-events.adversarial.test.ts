import { describe, expect, it } from 'vitest';

import {
  expandSchedulingCalendarEvents,
  schedulingEventsToBusyIntervals,
  type SchedulingCalendarEvent,
} from './calendar-events';

interface TestEvent extends SchedulingCalendarEvent {
  id: string;
}

function event(overrides: Partial<TestEvent> = {}): TestEvent {
  return {
    id: 'event-1',
    calendarId: 'calendar-1',
    startAt: '2026-08-24T13:00:00.000Z',
    endAt: '2026-08-24T14:00:00.000Z',
    timezone: 'UTC',
    status: 'confirmed',
    recurrenceRule: null,
    sourceType: 'google',
    providerEventId: 'provider-event-1',
    recurringEventId: null,
    recurrenceOriginalStartAt: null,
    ...overrides,
  };
}

const window = {
  start: new Date('2026-08-31T12:00:00.000Z'),
  end: new Date('2026-09-02T00:00:00.000Z'),
};

describe('adversarial recurrence busy-event expansion', () => {
  it('includes a master occurrence inside the window even when the master starts outside', () => {
    const expanded = expandSchedulingCalendarEvents(
      [
        event({
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
          providerEventId: 'series-outside',
        }),
      ],
      window,
    );

    expect(expanded.map((item) => [item.start, item.end])).toEqual([
      [Date.parse('2026-08-31T13:00:00.000Z'), Date.parse('2026-08-31T14:00:00.000Z')],
    ]);
  });

  it('suppresses a generated occurrence when its exception moves outside the window', () => {
    const expanded = expandSchedulingCalendarEvents(
      [
        event({
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
          providerEventId: 'series-moved-out',
        }),
        event({
          id: 'moved-out',
          recurringEventId: 'series-moved-out',
          recurrenceOriginalStartAt: '2026-08-31T13:00:00.000Z',
          startAt: '2026-09-05T13:00:00.000Z',
          endAt: '2026-09-05T14:00:00.000Z',
        }),
      ],
      window,
    );

    expect(expanded).toEqual([]);
  });

  it('includes an exception moved into the window from an original occurrence outside it', () => {
    const expanded = expandSchedulingCalendarEvents(
      [
        event({
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
          providerEventId: 'series-moved-in',
        }),
        event({
          id: 'moved-in',
          recurringEventId: 'series-moved-in',
          recurrenceOriginalStartAt: '2026-08-24T13:00:00.000Z',
          startAt: '2026-08-31T15:00:00.000Z',
          endAt: '2026-08-31T16:00:00.000Z',
        }),
      ],
      window,
    );

    expect(expanded.map((item) => item.event.id)).toEqual(['event-1', 'moved-in']);
    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-08-31T13:00:00.000Z',
      '2026-08-31T15:00:00.000Z',
    ]);
  });

  it('replaces a master occurrence with a modified exception without duplicating it', () => {
    const expanded = expandSchedulingCalendarEvents(
      [
        event({
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
          providerEventId: 'series-modified',
        }),
        event({
          id: 'modified',
          recurringEventId: 'series-modified',
          recurrenceOriginalStartAt: '2026-08-31T13:00:00.000Z',
          startAt: '2026-08-31T16:00:00.000Z',
          endAt: '2026-08-31T17:00:00.000Z',
        }),
      ],
      window,
    );

    expect(expanded.map((item) => item.event.id)).toEqual(['modified']);
    expect(expanded[0]?.occurrenceIndex).toBe(0);
  });

  it('keeps a cancelled exception out of the busy intervals', () => {
    const busy = schedulingEventsToBusyIntervals(
      [
        event({
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
          providerEventId: 'series-cancelled',
        }),
        event({
          id: 'cancelled',
          status: 'cancelled',
          recurringEventId: 'series-cancelled',
          recurrenceOriginalStartAt: '2026-08-31T13:00:00.000Z',
          startAt: '2026-08-31T13:00:00.000Z',
          endAt: '2026-08-31T14:00:00.000Z',
        }),
      ],
      window,
    );

    expect(busy).toEqual([]);
  });

  it('keeps weekly event wall-clock time stable across a non-US DST change', () => {
    const master = event({
      startAt: '2026-03-22T08:00:00.000Z', // 09:00 in Berlin before DST.
      endAt: '2026-03-22T08:30:00.000Z',
      timezone: 'Europe/Berlin',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=SU',
      providerEventId: 'berlin-series',
    });
    const expanded = expandSchedulingCalendarEvents([master], {
      start: new Date('2026-03-22T00:00:00.000Z'),
      end: new Date('2026-04-06T00:00:00.000Z'),
    });

    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-03-22T08:00:00.000Z',
      '2026-03-29T07:00:00.000Z',
      '2026-04-05T07:00:00.000Z',
    ]);
    expect(expanded.every((item) => item.end - item.start === 30 * 60_000)).toBe(true);
  });

  it('keeps recurrence end boundaries inclusive and does not add a later occurrence', () => {
    const expanded = expandSchedulingCalendarEvents(
      [
        event({
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260831',
          providerEventId: 'series-until',
        }),
      ],
      window,
    );

    expect(expanded.map((item) => new Date(item.start).toISOString())).toEqual([
      '2026-08-31T13:00:00.000Z',
    ]);
  });
});
