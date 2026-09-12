import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  dateMinuteToInstant,
  hasTimingChanged,
  isEventResizable,
  pointerYToSnappedMinute,
  resizeMinuteInterval,
} from './event-resize';

const calendar: Calendar = {
  id: '22222222-2222-2222-2222-222222222222',
  userId: '11111111-1111-1111-1111-111111111111',
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

const event: CalendarEvent = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: calendar.userId,
  calendarId: calendar.id,
  title: 'Planning',
  description: 'Notes',
  location: 'Room 2',
  startAt: '2026-09-15T18:00:00.000Z',
  endAt: '2026-09-15T19:00:00.000Z',
  allDay: false,
  timezone: 'America/New_York',
  status: 'confirmed',
  recurrenceRule: null,
  alerts: [15],
  sourceType: 'internal',
  providerEventId: null,
  recurringEventId: null,
  recurrenceOriginalStartAt: null,
  providerEtag: null,
  providerUpdatedAt: null,
  syncStatus: 'synced',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const occurrence = {
  event,
  calendar,
  start: Date.parse(event.startAt),
  end: Date.parse(event.endAt),
};

describe('calendar event resize math', () => {
  it('maps rendered pointer geometry to the nearest 15-minute boundary', () => {
    expect(pointerYToSnappedMinute(122, 100, 60)).toBe(15);
    expect(pointerYToSnappedMinute(143, 100, 60)).toBe(45);
    expect(pointerYToSnappedMinute(143, 100, 54)).toBe(45);
  });

  it('preserves the opposite boundary for top and bottom resize', () => {
    expect(resizeMinuteInterval({ startMinute: 120, endMinute: 180 }, 'start', 103)).toEqual({
      startMinute: 105,
      endMinute: 180,
    });
    expect(resizeMinuteInterval({ startMinute: 120, endMinute: 180 }, 'end', 202)).toEqual({
      startMinute: 120,
      endMinute: 195,
    });
  });

  it('enforces the 15-minute minimum duration on both edges', () => {
    expect(resizeMinuteInterval({ startMinute: 120, endMinute: 180 }, 'start', 190)).toEqual({
      startMinute: 165,
      endMinute: 180,
    });
    expect(resizeMinuteInterval({ startMinute: 120, endMinute: 180 }, 'end', 100)).toEqual({
      startMinute: 120,
      endMinute: 135,
    });
    expect(resizeMinuteInterval({ startMinute: 130, endMinute: 180 }, 'end', 130)).toEqual({
      startMinute: 130,
      endMinute: 150,
    });
    expect(resizeMinuteInterval({ startMinute: 120, endMinute: 190 }, 'start', 190)).toEqual({
      startMinute: 165,
      endMinute: 190,
    });
  });

  it('clamps cleanly to the 00:00 and 24:00 boundaries', () => {
    expect(pointerYToSnappedMinute(-50, 0, 64)).toBe(0);
    expect(pointerYToSnappedMinute(2_000, 0, 64)).toBe(1_440);
    expect(resizeMinuteInterval({ startMinute: 30, endMinute: 60 }, 'start', -30)).toEqual({
      startMinute: 0,
      endMinute: 60,
    });
    expect(resizeMinuteInterval({ startMinute: 1_380, endMinute: 1_410 }, 'end', 1_500)).toEqual({
      startMinute: 1_380,
      endMinute: 1_440,
    });
  });

  it('does not report an update when the final snapped interval is unchanged', () => {
    expect(hasTimingChanged({ start: 100, end: 200 }, { start: 100, end: 200 })).toBe(false);
    expect(hasTimingChanged({ start: 100, end: 200 }, { start: 115, end: 200 })).toBe(true);
  });

  it('uses the configured timezone and rejects nonexistent DST wall times', () => {
    expect(dateMinuteToInstant('2026-03-08', 60, 'America/New_York')?.toISOString()).toBe(
      '2026-03-08T06:00:00.000Z',
    );
    expect(dateMinuteToInstant('2026-03-08', 135, 'America/New_York')).toBeNull();
    expect(dateMinuteToInstant('2026-03-08', 1_440, 'America/New_York')?.toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });
});

describe('calendar event resize eligibility', () => {
  it('allows normal writable events and rejects read-only calendars', () => {
    expect(isEventResizable(occurrence, '2026-09-15', 'America/New_York')).toBe(true);
    expect(
      isEventResizable(
        { ...occurrence, calendar: { ...calendar, sourceType: 'google' } },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(true);
    expect(
      isEventResizable(
        { ...occurrence, calendar: { ...calendar, isReadOnly: true } },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
  });

  it('rejects generated and materialized recurring occurrences', () => {
    expect(
      isEventResizable(
        { ...occurrence, event: { ...event, recurrenceRule: 'FREQ=WEEKLY' } },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
    expect(
      isEventResizable(
        {
          ...occurrence,
          event: {
            ...event,
            recurringEventId: 'provider-master',
            recurrenceOriginalStartAt: event.startAt,
          },
        },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
  });

  it('rejects multi-day and clipped visual segments', () => {
    expect(
      isEventResizable(
        {
          ...occurrence,
          event: { ...event, endAt: '2026-09-16T15:00:00.000Z' },
          end: Date.parse('2026-09-16T15:00:00.000Z'),
        },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
    expect(
      isEventResizable(
        { ...occurrence, start: occurrence.start + 15 * 60_000 },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
  });
});
