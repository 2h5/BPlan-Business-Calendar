import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { describeDayGlance, type DayGlanceInput } from './day-glance';
import type { EventOccurrence } from '../../calendar/hooks/useCalendarWindow';

const TZ = 'America/New_York';
// 2026-09-23 in New York is UTC-4.
const at = (hhmm: string): number => new Date(`2026-09-23T${hhmm}:00-04:00`).getTime();

function occurrence(
  title: string,
  start: number,
  end: number,
  overrides: Partial<CalendarEvent> = {},
): EventOccurrence {
  const event: CalendarEvent = {
    id: `event-${title}`,
    userId: '11111111-1111-1111-1111-111111111111',
    calendarId: '22222222-2222-2222-2222-222222222222',
    title,
    description: null,
    location: null,
    color: null,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    allDay: false,
    timezone: TZ,
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
  return { key: `${event.id}:0`, event, calendar: undefined, start, end, occurrenceIndex: 0 };
}

function input(overrides: Partial<DayGlanceInput> = {}): DayGlanceInput {
  return {
    now: new Date(at('10:00')),
    timeZone: TZ,
    hourCycle: 'h12',
    timed: [],
    allDay: [],
    freeTime: { freeMinutes: 0, intervals: [] },
    workdayEndsAt: at('17:00'),
    ...overrides,
  };
}

describe('describeDayGlance', () => {
  it('counts down to the next event while free', () => {
    const glance = describeDayGlance(
      input({ timed: [occurrence('Standup', at('10:48'), at('11:00'))] }),
    );
    expect(glance.live).toBe(false);
    expect(glance.eyebrow).toBe('Up next · in 48m');
    expect(glance.title).toBe('Standup');
  });

  it('reports a running event as live with its end time', () => {
    const glance = describeDayGlance(
      input({
        now: new Date(at('20:15')),
        timed: [occurrence('Dinner', at('20:00'), at('21:30'), { location: 'Home' })],
      }),
    );
    expect(glance.live).toBe(true);
    expect(glance.eyebrow).toBe('Now · ends 9:30 PM');
    expect(glance.meta).toBe('8:00 PM – 9:30 PM · Home');
    expect(glance.capacity).toBe('Workday done');
  });

  it('falls back to an all-day event once nothing timed is left', () => {
    const glance = describeDayGlance(
      input({ allDay: [occurrence('Conference', at('00:00'), at('23:59'), { allDay: true })] }),
    );
    expect(glance.eyebrow).toBe('Today');
    expect(glance.meta).toBe('All day');
  });

  it('describes remaining free working time', () => {
    const glance = describeDayGlance(
      input({
        freeTime: {
          freeMinutes: 330,
          intervals: [
            { start: at('10:00'), end: at('12:00') },
            { start: at('13:30'), end: at('17:00') },
          ],
        },
      }),
    );
    expect(glance.capacity).toBe('5h 30m free');
    expect(glance.capacityDetail).toBe('2 open blocks');
  });

  it('calls a day without working hours a day off', () => {
    expect(describeDayGlance(input({ workdayEndsAt: null })).capacity).toBe('Day off');
  });
});
