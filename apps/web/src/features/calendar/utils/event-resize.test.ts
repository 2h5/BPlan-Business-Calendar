import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  dateMinuteToInstant,
  hasTimingChanged,
  isEventMovable,
  isEventResizable,
  moveMinuteInterval,
  pointerYToSnappedMinute,
  resizeMinuteInterval,
  resolveMoveGesture,
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

describe('calendar event move math', () => {
  it('shifts interval while preserving duration exactly', () => {
    // 10:00 - 11:00 (600 - 660) dragged down 45 minutes => 10:45 - 11:45 (645 - 705)
    expect(moveMinuteInterval({ startMinute: 600, endMinute: 660 }, 45)).toEqual({
      startMinute: 645,
      endMinute: 705,
    });
    // Dragged up 30 minutes => 09:30 - 10:30 (570 - 630)
    expect(moveMinuteInterval({ startMinute: 600, endMinute: 660 }, -30)).toEqual({
      startMinute: 570,
      endMinute: 630,
    });
  });

  it('snaps delta to 15-minute increments', () => {
    // 6px / 64px * 60 ~= 5.6 minutes -> snaps to 0
    expect(moveMinuteInterval({ startMinute: 600, endMinute: 660 }, 5.6)).toEqual({
      startMinute: 600,
      endMinute: 660,
    });
    // 8 minutes -> snaps to 15
    expect(moveMinuteInterval({ startMinute: 600, endMinute: 660 }, 8)).toEqual({
      startMinute: 615,
      endMinute: 675,
    });
    // 22 minutes -> snaps to 15
    expect(moveMinuteInterval({ startMinute: 600, endMinute: 660 }, 22)).toEqual({
      startMinute: 615,
      endMinute: 675,
    });
    // 23 minutes -> snaps to 30
    expect(moveMinuteInterval({ startMinute: 600, endMinute: 660 }, 23)).toEqual({
      startMinute: 630,
      endMinute: 690,
    });
  });

  it('clamps cleanly to 00:00 and 24:00 day boundaries without altering duration', () => {
    // 30m event near start clamped at 0
    expect(moveMinuteInterval({ startMinute: 30, endMinute: 60 }, -120)).toEqual({
      startMinute: 0,
      endMinute: 30,
    });
    // 60m event clamped at top
    expect(moveMinuteInterval({ startMinute: 60, endMinute: 120 }, -200)).toEqual({
      startMinute: 0,
      endMinute: 60,
    });
    // 60m event clamped at bottom (1440 - 60 = 1380)
    expect(moveMinuteInterval({ startMinute: 1320, endMinute: 1380 }, 300)).toEqual({
      startMinute: 1380,
      endMinute: 1440,
    });
    // 90m event clamped at bottom (1440 - 90 = 1350)
    expect(moveMinuteInterval({ startMinute: 1300, endMinute: 1390 }, 300)).toEqual({
      startMinute: 1350,
      endMinute: 1440,
    });
  });
});

describe('calendar event move eligibility', () => {
  it('shares eligibility rules with resizing', () => {
    expect(isEventMovable(occurrence, '2026-09-15', 'America/New_York')).toBe(true);
    expect(
      isEventMovable(
        { ...occurrence, calendar: { ...calendar, isReadOnly: true } },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
    expect(
      isEventMovable(
        { ...occurrence, event: { ...event, recurrenceRule: 'FREQ=DAILY' } },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
    expect(
      isEventMovable(
        { ...occurrence, event: { ...event, allDay: true } },
        '2026-09-15',
        'America/New_York',
      ),
    ).toBe(false);
  });
});

describe('calendar event move gesture disambiguation and collision semantics', () => {
  const originalMinutes = { startMinute: 600, endMinute: 660 }; // 10:00 - 11:00 (duration: 60m)
  const hourHeight = 64;

  it('treats pointer movement strictly below 6px threshold as click', () => {
    expect(
      resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 103, // 3px down (< 6px)
        currentX: 102, // 2px right (< 6px)
        hourHeight,
        originalMinutes,
      }),
    ).toEqual({ type: 'click' });

    expect(
      resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 95, // 5px up (< 6px)
        currentX: 100,
        hourHeight,
        originalMinutes,
      }),
    ).toEqual({ type: 'click' });
  });

  it('begins whole-event move drag when pointer movement reaches or exceeds 6px', () => {
    // 6px down is >= 6px threshold, 6px / 64px * 60 = 5.6m -> snaps to 0m delta => noop
    expect(
      resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 106,
        currentX: 100,
        hourHeight,
        originalMinutes,
      }),
    ).toEqual({ type: 'noop' });

    // 16px down (15m step): 16 / 64 * 60 = 15m -> snaps to +15m
    const result = resolveMoveGesture({
      startY: 100,
      startX: 100,
      currentY: 116,
      currentX: 100,
      hourHeight,
      originalMinutes,
    });
    expect(result).toEqual({
      type: 'move',
      nextMinutes: { startMinute: 615, endMinute: 675 },
    });
    if (result.type === 'move') {
      // Invariant duration: exactly 60 minutes
      expect(result.nextMinutes.endMinute - result.nextMinutes.startMinute).toBe(60);
    }
  });

  it('snaps move deltas to 15-minute grid increments', () => {
    // 32px down = 30m -> 10:30 - 11:30
    expect(
      resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 132,
        currentX: 100,
        hourHeight,
        originalMinutes,
      }),
    ).toEqual({
      type: 'move',
      nextMinutes: { startMinute: 630, endMinute: 690 },
    });

    // 48px down = 45m -> 10:45 - 11:45
    expect(
      resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 148,
        currentX: 100,
        hourHeight,
        originalMinutes,
      }),
    ).toEqual({
      type: 'move',
      nextMinutes: { startMinute: 645, endMinute: 705 },
    });
  });

  it('detects no-op moves when user drags >= 6px but releases in the original slot', () => {
    // 7px movement (crossed threshold) but less than half a snap interval (7.5m / 8px)
    expect(
      resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 107,
        currentX: 100,
        hourHeight,
        originalMinutes,
      }),
    ).toEqual({ type: 'noop' });
  });

  it('cancels drag cleanly when cancelled flag is set', () => {
    expect(
      resolveMoveGesture({
        startY: 100,
        startX: 100,
        currentY: 148,
        currentX: 100,
        hourHeight,
        originalMinutes,
        cancelled: true,
      }),
    ).toEqual({ type: 'cancel' });
  });

  it('preserves duration invariance when clamping at day limits', () => {
    // Large drag upwards beyond 00:00 (1000px up from 10:00 exceeds 600 minutes)
    const topResult = resolveMoveGesture({
      startY: 1000,
      startX: 100,
      currentY: 0,
      currentX: 100,
      hourHeight,
      originalMinutes,
    });
    expect(topResult).toEqual({
      type: 'move',
      nextMinutes: { startMinute: 0, endMinute: 60 },
    });
    if (topResult.type === 'move') {
      expect(topResult.nextMinutes.endMinute - topResult.nextMinutes.startMinute).toBe(60);
    }

    // Large drag downwards beyond 24:00
    const bottomResult = resolveMoveGesture({
      startY: 100,
      startX: 100,
      currentY: 2000,
      currentX: 100,
      hourHeight,
      originalMinutes,
    });
    expect(bottomResult).toEqual({
      type: 'move',
      nextMinutes: { startMinute: 1380, endMinute: 1440 },
    });
    if (bottomResult.type === 'move') {
      expect(bottomResult.nextMinutes.endMinute - bottomResult.nextMinutes.startMinute).toBe(60);
    }
  });
});
