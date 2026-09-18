import { describe, expect, it } from 'vitest';

import {
  dateKeyMinuteToInstant,
  isOccurrenceMovable,
  isOccurrenceMovableByDay,
  MINUTES_PER_DAY,
  resolveMovedInterval,
  shiftOccurrenceByDays,
  type MovableOccurrence,
} from './event-move';

const NY = 'America/New_York';

describe('resolveMovedInterval', () => {
  const eleven = { startMinute: 11 * 60, durationMinutes: 60 };

  it('leaves an untouched event where it was', () => {
    expect(resolveMovedInterval({ ...eleven, deltaMinutes: 0, dayDelta: 0 })).toEqual({
      dayDelta: 0,
      startMinute: 660,
      endMinute: 720,
    });
  });

  it('moves 11am to 1pm for a two-hour drag', () => {
    const moved = resolveMovedInterval({ ...eleven, deltaMinutes: 120, dayDelta: 0 });
    expect(moved.startMinute).toBe(13 * 60);
    expect(moved.endMinute).toBe(14 * 60);
  });

  it('snaps a rough drag to the quarter hour', () => {
    expect(resolveMovedInterval({ ...eleven, deltaMinutes: 8, dayDelta: 0 }).startMinute).toBe(
      11 * 60 + 15,
    );
    expect(resolveMovedInterval({ ...eleven, deltaMinutes: 6, dayDelta: 0 }).startMinute).toBe(
      11 * 60,
    );
  });

  it('snaps the delta, not the clock, so an odd start time keeps its offset', () => {
    const moved = resolveMovedInterval({
      startMinute: 11 * 60 + 7,
      durationMinutes: 30,
      deltaMinutes: 60,
      dayDelta: 0,
    });
    expect(moved.startMinute).toBe(12 * 60 + 7);
  });

  it('preserves duration', () => {
    const moved = resolveMovedInterval({
      startMinute: 9 * 60,
      durationMinutes: 90,
      deltaMinutes: 200,
      dayDelta: 0,
    });
    expect(moved.endMinute - moved.startMinute).toBe(90);
  });

  it('carries the day delta through untouched', () => {
    expect(resolveMovedInterval({ ...eleven, deltaMinutes: 0, dayDelta: 3 }).dayDelta).toBe(3);
  });

  it('pins an event dragged past midnight to the end of the day', () => {
    const moved = resolveMovedInterval({
      startMinute: 23 * 60,
      durationMinutes: 60,
      deltaMinutes: 600,
      dayDelta: 0,
    });
    expect(moved.startMinute).toBe(23 * 60);
    expect(moved.endMinute).toBe(MINUTES_PER_DAY);
  });

  it('pins an event dragged above midnight to the start of the day', () => {
    const moved = resolveMovedInterval({
      startMinute: 30,
      durationMinutes: 60,
      deltaMinutes: -600,
      dayDelta: 0,
    });
    expect(moved).toMatchObject({ startMinute: 0, endMinute: 60 });
  });
});

describe('dateKeyMinuteToInstant', () => {
  it('resolves a plain wall-clock time', () => {
    const instant = dateKeyMinuteToInstant('2026-09-17', 13 * 60, NY);
    expect(instant?.toISOString()).toBe('2026-09-17T17:00:00.000Z');
  });

  it('treats minute 1440 as the following midnight', () => {
    const instant = dateKeyMinuteToInstant('2026-09-17', MINUTES_PER_DAY, NY);
    expect(instant?.toISOString()).toBe('2026-09-18T04:00:00.000Z');
  });

  it('returns null for the hour a spring-forward skips', () => {
    // 2026-03-08 02:30 does not exist in New York.
    expect(dateKeyMinuteToInstant('2026-03-08', 2 * 60 + 30, NY)).toBeNull();
  });

  it('still resolves times either side of that gap', () => {
    expect(dateKeyMinuteToInstant('2026-03-08', 60, NY)).not.toBeNull();
    expect(dateKeyMinuteToInstant('2026-03-08', 4 * 60, NY)).not.toBeNull();
  });

  it('rejects a malformed date key or an out-of-range minute', () => {
    expect(dateKeyMinuteToInstant('nonsense', 60, NY)).toBeNull();
    expect(dateKeyMinuteToInstant('2026-09-17', -1, NY)).toBeNull();
    expect(dateKeyMinuteToInstant('2026-09-17', MINUTES_PER_DAY + 1, NY)).toBeNull();
  });
});

describe('isOccurrenceMovable', () => {
  const start = Date.parse('2026-09-17T15:00:00.000Z');
  const end = Date.parse('2026-09-17T16:00:00.000Z');

  const occurrence = (
    overrides: {
      event?: Partial<MovableOccurrence['event']>;
      calendar?: MovableOccurrence['calendar'];
      start?: number;
      end?: number;
    } = {},
  ): MovableOccurrence => ({
    event: {
      allDay: false,
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      recurrenceRule: null,
      recurringEventId: null,
      recurrenceOriginalStartAt: null,
      ...overrides.event,
    },
    calendar:
      'calendar' in overrides
        ? overrides.calendar
        : { isReadOnly: false, sourceType: 'internal' as const },
    start: overrides.start ?? start,
    end: overrides.end ?? end,
  });

  it('accepts an ordinary event on the day it is drawn', () => {
    expect(isOccurrenceMovable(occurrence(), '2026-09-17', NY)).toBe(true);
  });

  it('accepts an event on a provider calendar', () => {
    const provider = occurrence({ calendar: { isReadOnly: false, sourceType: 'google' } });
    expect(isOccurrenceMovable(provider, '2026-09-17', NY)).toBe(true);
  });

  it('refuses a read-only calendar', () => {
    const readOnly = occurrence({ calendar: { isReadOnly: true, sourceType: 'google' } });
    expect(isOccurrenceMovable(readOnly, '2026-09-17', NY)).toBe(false);
  });

  it('refuses an occurrence whose calendar has not loaded', () => {
    expect(isOccurrenceMovable(occurrence({ calendar: undefined }), '2026-09-17', NY)).toBe(false);
  });

  it('refuses an all-day event', () => {
    expect(isOccurrenceMovable(occurrence({ event: { allDay: true } }), '2026-09-17', NY)).toBe(
      false,
    );
  });

  it('refuses a recurring master and a provider exception alike', () => {
    const rule = occurrence({ event: { recurrenceRule: 'FREQ=WEEKLY' } });
    const child = occurrence({ event: { recurringEventId: 'master-1' } });
    const exception = occurrence({
      event: { recurrenceOriginalStartAt: '2026-09-17T15:00:00.000Z' },
    });
    expect(isOccurrenceMovable(rule, '2026-09-17', NY)).toBe(false);
    expect(isOccurrenceMovable(child, '2026-09-17', NY)).toBe(false);
    expect(isOccurrenceMovable(exception, '2026-09-17', NY)).toBe(false);
  });

  it('refuses an occurrence drawn on a day other than the one it starts on', () => {
    expect(isOccurrenceMovable(occurrence(), '2026-09-18', NY)).toBe(false);
  });

  it('refuses an event spanning more than the day it is drawn on', () => {
    const overnight = occurrence({
      event: { endAt: '2026-09-18T06:00:00.000Z' },
      end: Date.parse('2026-09-18T06:00:00.000Z'),
    });
    expect(isOccurrenceMovable(overnight, '2026-09-17', NY)).toBe(false);
  });

  it('accepts an event ending exactly at midnight', () => {
    const toMidnight = occurrence({
      event: {
        startAt: '2026-09-18T02:00:00.000Z',
        endAt: '2026-09-18T04:00:00.000Z',
      },
      start: Date.parse('2026-09-18T02:00:00.000Z'),
      end: Date.parse('2026-09-18T04:00:00.000Z'),
    });
    expect(isOccurrenceMovable(toMidnight, '2026-09-17', NY)).toBe(true);
  });

  it('refuses a drawn occurrence that is not the stored row', () => {
    const drifted = occurrence({ start: start + 60_000 });
    expect(isOccurrenceMovable(drifted, '2026-09-17', NY)).toBe(false);
  });
});

describe('isOccurrenceMovableByDay', () => {
  const start = Date.parse('2026-09-17T15:00:00.000Z');
  const end = Date.parse('2026-09-17T16:00:00.000Z');

  const occurrence = (
    overrides: {
      event?: Partial<MovableOccurrence['event']>;
      calendar?: MovableOccurrence['calendar'];
      start?: number;
      end?: number;
    } = {},
  ): MovableOccurrence => ({
    event: {
      allDay: false,
      startAt: new Date(overrides.start ?? start).toISOString(),
      endAt: new Date(overrides.end ?? end).toISOString(),
      recurrenceRule: null,
      recurringEventId: null,
      recurrenceOriginalStartAt: null,
      ...overrides.event,
    },
    calendar:
      'calendar' in overrides
        ? overrides.calendar
        : { isReadOnly: false, sourceType: 'internal' as const },
    start: overrides.start ?? start,
    end: overrides.end ?? end,
  });

  it('accepts an ordinary timed event', () => {
    expect(isOccurrenceMovableByDay(occurrence())).toBe(true);
  });

  it('accepts an all-day event, which the hour grid refuses', () => {
    const allDay = occurrence({ event: { allDay: true } });
    expect(isOccurrenceMovableByDay(allDay)).toBe(true);
    expect(isOccurrenceMovable(allDay, '2026-09-17', NY)).toBe(false);
  });

  it('accepts a multi-day event, which the hour grid refuses', () => {
    const spanning = occurrence({ end: Date.parse('2026-09-19T16:00:00.000Z') });
    expect(isOccurrenceMovableByDay(spanning)).toBe(true);
    expect(isOccurrenceMovable(spanning, '2026-09-17', NY)).toBe(false);
  });

  it('still refuses read-only, recurring, and non-stored occurrences', () => {
    expect(
      isOccurrenceMovableByDay(
        occurrence({ calendar: { isReadOnly: true, sourceType: 'google' } }),
      ),
    ).toBe(false);
    expect(isOccurrenceMovableByDay(occurrence({ event: { recurrenceRule: 'FREQ=WEEKLY' } }))).toBe(
      false,
    );
    expect(isOccurrenceMovableByDay(occurrence({ event: { recurringEventId: 'master-1' } }))).toBe(
      false,
    );
    expect(isOccurrenceMovableByDay(occurrence({ calendar: undefined }))).toBe(false);

    const drifted: MovableOccurrence = { ...occurrence(), start: start + 60_000 };
    expect(isOccurrenceMovableByDay(drifted)).toBe(false);
  });
});

describe('shiftOccurrenceByDays', () => {
  const occurrence = (startIso: string, endIso: string) => ({
    start: Date.parse(startIso),
    end: Date.parse(endIso),
  });

  it('moves both ends forward by whole days', () => {
    const moved = shiftOccurrenceByDays(
      occurrence('2026-09-17T15:00:00.000Z', '2026-09-17T16:00:00.000Z'),
      3,
      NY,
    );
    expect(moved.startAt.toISOString()).toBe('2026-09-20T15:00:00.000Z');
    expect(moved.endAt.toISOString()).toBe('2026-09-20T16:00:00.000Z');
  });

  it('moves backwards too', () => {
    const moved = shiftOccurrenceByDays(
      occurrence('2026-09-17T15:00:00.000Z', '2026-09-17T16:00:00.000Z'),
      -10,
      NY,
    );
    expect(moved.startAt.toISOString()).toBe('2026-09-07T15:00:00.000Z');
  });

  it('is a no-op for a zero delta', () => {
    const original = occurrence('2026-09-17T15:00:00.000Z', '2026-09-17T16:00:00.000Z');
    const moved = shiftOccurrenceByDays(original, 0, NY);
    expect(moved.startAt.getTime()).toBe(original.start);
    expect(moved.endAt.getTime()).toBe(original.end);
  });

  it('keeps the wall-clock time across a DST change rather than the elapsed hours', () => {
    // 9am New York on 2026-03-07 is 14:00Z; the next day the clocks go forward,
    // so the same 9am is 13:00Z. The event should still read 9am.
    const moved = shiftOccurrenceByDays(
      occurrence('2026-03-07T14:00:00.000Z', '2026-03-07T15:00:00.000Z'),
      1,
      NY,
    );
    expect(moved.startAt.toISOString()).toBe('2026-03-08T13:00:00.000Z');
    expect(moved.endAt.toISOString()).toBe('2026-03-08T14:00:00.000Z');
  });

  it('carries a multi-day event whole', () => {
    const moved = shiftOccurrenceByDays(
      occurrence('2026-09-18T04:00:00.000Z', '2026-09-20T04:00:00.000Z'),
      7,
      NY,
    );
    expect(moved.startAt.toISOString()).toBe('2026-09-25T04:00:00.000Z');
    expect(moved.endAt.toISOString()).toBe('2026-09-27T04:00:00.000Z');
  });
});
