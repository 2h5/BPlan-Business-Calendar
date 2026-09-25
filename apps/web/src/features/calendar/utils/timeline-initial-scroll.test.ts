import type { CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import type { EventOccurrence } from './calendar-occurrences';
import { initialScrollHour, type InitialScrollInput } from './timeline-initial-scroll';

const TIME_ZONE = 'UTC';
const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];

function occurrence(id: string, startIso: string, allDay = false): EventOccurrence {
  const start = Date.parse(startIso);
  return {
    key: `${id}:0`,
    event: { id, allDay } as CalendarEvent,
    calendar: undefined,
    start,
    end: start + 60 * 60 * 1000,
    occurrenceIndex: 0,
  };
}

function input(overrides: Partial<InitialScrollInput>): InitialScrollInput {
  return {
    dateKeys: WEEK,
    byDateKey: new Map(),
    revealEventId: null,
    todayKey: '2026-09-24',
    now: new Date('2026-09-24T09:00:00.000Z'),
    timeZone: TIME_ZONE,
    ...overrides,
  };
}

describe('initialScrollHour', () => {
  it('starts shortly before now on a timeline that shows today', () => {
    expect(initialScrollHour(input({}))).toBe(7);
  });

  it('starts at the working day on a timeline without today', () => {
    expect(initialScrollHour(input({ todayKey: '2026-10-01' }))).toBe(7);
  });

  it('brings a linked event below the fold into view', () => {
    const planTomorrow = occurrence('plan', '2026-09-24T19:45:00.000Z');
    const byDateKey = new Map([['2026-09-24', [planTomorrow]]]);

    expect(initialScrollHour(input({ byDateKey, revealEventId: 'plan' }))).toBe(18.75);
  });

  it('brings a linked event above the fold into view', () => {
    const early = occurrence('early', '2026-09-24T01:30:00.000Z');
    const byDateKey = new Map([['2026-09-24', [early]]]);
    const evening = new Date('2026-09-24T21:00:00.000Z');

    expect(initialScrollHour(input({ byDateKey, revealEventId: 'early', now: evening }))).toBe(0.5);
  });

  it('starts from the top for a linked event that began before the visible days', () => {
    const overnight = occurrence('overnight', '2026-09-20T22:00:00.000Z');
    const byDateKey = new Map([['2026-09-21', [overnight]]]);

    expect(initialScrollHour(input({ byDateKey, revealEventId: 'overnight' }))).toBe(0);
  });

  it('falls back to now for all-day or missing linked events', () => {
    const holiday = occurrence('holiday', '2026-09-24T00:00:00.000Z', true);
    const byDateKey = new Map([['2026-09-24', [holiday]]]);

    expect(initialScrollHour(input({ byDateKey, revealEventId: 'holiday' }))).toBe(7);
    expect(initialScrollHour(input({ byDateKey, revealEventId: 'missing' }))).toBe(7);
  });
});
