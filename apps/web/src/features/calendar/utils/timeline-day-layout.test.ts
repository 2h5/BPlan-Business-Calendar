import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import type { EventOccurrence } from './calendar-occurrences';
import { layoutTimelineDay, type TimelineDayLayoutInput } from './timeline-day-layout';

const timeZone = 'UTC';
const day = '2026-09-15';
const nextDay = '2026-09-16';

const calendar: Calendar = {
  id: 'b0000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Work',
  color: '#4766db',
  sourceType: 'internal',
  providerAccountId: null,
  providerCalendarId: null,
  isVisible: true,
  isDefault: true,
  isReadOnly: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

function at(dateKey: string, minute: number): number {
  return Date.parse(`${dateKey}T00:00:00.000Z`) + minute * 60_000;
}

function occurrence(key: string, start: number, end: number): EventOccurrence {
  const event: CalendarEvent = {
    id: `event-${key}`,
    userId: calendar.userId,
    calendarId: calendar.id,
    title: key,
    description: null,
    location: null,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    allDay: false,
    timezone: timeZone,
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
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    color: null,
  };
  return { key, event, calendar, start, end, occurrenceIndex: 0 };
}

function layout(overrides: Partial<TimelineDayLayoutInput> & { occurrences: EventOccurrence[] }) {
  return layoutTimelineDay({
    dateKey: day,
    timeZone,
    resize: null,
    resizePreviewKey: null,
    move: null,
    draft: null,
    hasDragSelection: false,
    ...overrides,
  });
}

function summary(result: ReturnType<typeof layoutTimelineDay>) {
  return result.events.map((placed) => ({
    key: placed.item.key,
    column: placed.column,
    left: placed.left,
    width: placed.width,
    startMinute: placed.startMinute,
    endMinute: placed.endMinute,
  }));
}

describe('layoutTimelineDay', () => {
  it('places overlapping events side by side and a separate event at full width', () => {
    const a = occurrence('a', at(day, 9 * 60), at(day, 11 * 60));
    const b = occurrence('b', at(day, 10 * 60), at(day, 12 * 60));
    const c = occurrence('c', at(day, 13 * 60), at(day, 14 * 60));

    expect(summary(layout({ occurrences: [a, b, c] }))).toEqual([
      { key: 'a', column: 0, left: 0, width: 0.5, startMinute: 540, endMinute: 660 },
      { key: 'b', column: 1, left: 0.5, width: 0.5, startMinute: 600, endMinute: 720 },
      { key: 'c', column: 0, left: 0, width: 1, startMinute: 780, endMinute: 840 },
    ]);
  });

  it('keeps source render order even when layout columns are in a different order', () => {
    const early = occurrence('early', at(day, 9 * 60), at(day, 10 * 60));
    const late = occurrence('late', at(day, 9 * 60 + 30), at(day, 10 * 60 + 30));

    const result = layout({ occurrences: [late, early] });

    expect(result.events.map((placed) => placed.item.key)).toEqual(['late', 'early']);
    expect(result.events.map((placed) => placed.column)).toEqual([1, 0]);
  });

  it('only includes timed events that start on the day and clamps ones that run past midnight', () => {
    const overnight = occurrence('overnight', at(day, 23 * 60), at(nextDay, 60));
    const tomorrow = occurrence('tomorrow', at(nextDay, 9 * 60), at(nextDay, 10 * 60));

    expect(summary(layout({ occurrences: [overnight, tomorrow] }))).toEqual([
      { key: 'overnight', column: 0, left: 0, width: 1, startMinute: 1380, endMinute: 1440 },
    ]);
  });

  it('applies timing overrides, including moving an event to another day', () => {
    const a = occurrence('a', at(day, 9 * 60), at(day, 10 * 60));
    const b = occurrence('b', at(day, 11 * 60), at(day, 12 * 60));
    const timingOverrides = new Map([
      [a.event.id, { start: at(day, 15 * 60), end: at(day, 16 * 60) }],
      [b.event.id, { start: at(nextDay, 8 * 60), end: at(nextDay, 9 * 60) }],
    ]);

    expect(summary(layout({ occurrences: [a, b], timingOverrides }))).toEqual([
      { key: 'a', column: 0, left: 0, width: 1, startMinute: 900, endMinute: 960 },
    ]);
    expect(summary(layout({ dateKey: nextDay, occurrences: [a, b], timingOverrides }))).toEqual([
      { key: 'b', column: 0, left: 0, width: 1, startMinute: 480, endMinute: 540 },
    ]);
  });

  describe('while resizing', () => {
    const anchor = occurrence('anchor', at(day, 9 * 60), at(day, 10 * 60));
    const resized = occurrence('resized', at(day, 9 * 60 + 30), at(day, 10 * 60 + 30));
    const resize = {
      occurrenceKey: 'resized',
      originalMinutes: { startMinute: 570, endMinute: 630 },
      currentMinutes: { startMinute: 480, endMinute: 630 },
    };

    it('previews the current minutes but keeps the column from the original interval', () => {
      const result = layout({
        occurrences: [anchor, resized],
        resize,
        resizePreviewKey: 'resized',
      });

      expect(summary(result)).toEqual([
        { key: 'anchor', column: 0, left: 0, width: 0.5, startMinute: 540, endMinute: 600 },
        { key: 'resized', column: 1, left: 0.5, width: 0.5, startMinute: 480, endMinute: 630 },
      ]);
    });

    it('would swap columns without the gesture ordering', () => {
      const timingOverrides = new Map([
        [resized.event.id, { start: at(day, 8 * 60), end: at(day, 10 * 60 + 30) }],
      ]);

      expect(
        layout({ occurrences: [anchor, resized], timingOverrides }).events.map((placed) => [
          placed.item.key,
          placed.column,
        ]),
      ).toEqual([
        ['anchor', 1],
        ['resized', 0],
      ]);
    });

    it('does not re-time the event until its resize preview is showing', () => {
      const result = layout({ occurrences: [anchor, resized], resize, resizePreviewKey: null });

      expect(result.events.find((placed) => placed.item.key === 'resized')).toMatchObject({
        startMinute: 570,
        endMinute: 630,
        column: 1,
      });
    });
  });

  describe('while moving', () => {
    const anchor = occurrence('anchor', at(day, 9 * 60), at(day, 10 * 60));
    const moved = occurrence('moved', at(day, 9 * 60 + 30), at(day, 10 * 60 + 30));

    it('previews the move on the same day, ordered by where it started', () => {
      const result = layout({
        occurrences: [moved, anchor],
        move: {
          occurrenceKey: 'moved',
          dateKey: day,
          originalMinutes: { startMinute: 570, endMinute: 630 },
          currentMinutes: { startMinute: 510, endMinute: 570 },
        },
      });

      expect(summary(result)).toEqual([
        { key: 'moved', column: 1, left: 0.5, width: 0.5, startMinute: 510, endMinute: 570 },
        { key: 'anchor', column: 0, left: 0, width: 0.5, startMinute: 540, endMinute: 600 },
      ]);
    });

    it('places a cross-day move in the target column only, ahead of any timing override', () => {
      // On the target day it is still ordered by its original wall-clock minutes
      // (9:30), so it keeps the left column over the 14:00 event it now overlaps.
      const other = occurrence('other', at(nextDay, 14 * 60), at(nextDay, 15 * 60));
      const occurrences = [moved, anchor, other];
      const move = {
        occurrenceKey: 'moved',
        dateKey: nextDay,
        originalMinutes: { startMinute: 570, endMinute: 630 },
        currentMinutes: { startMinute: 14 * 60 + 30, endMinute: 15 * 60 + 30 },
      };
      const timingOverrides = new Map([
        [moved.event.id, { start: at(day, 12 * 60), end: at(day, 13 * 60) }],
      ]);

      expect(layout({ occurrences, move, timingOverrides }).events.map((p) => p.item.key)).toEqual([
        'anchor',
      ]);
      expect(summary(layout({ dateKey: nextDay, occurrences, move, timingOverrides }))).toEqual([
        { key: 'moved', column: 0, left: 0, width: 0.5, startMinute: 870, endMinute: 930 },
        { key: 'other', column: 1, left: 0.5, width: 0.5, startMinute: 840, endMinute: 900 },
      ]);
    });
  });

  describe('quick-create draft', () => {
    const event = occurrence('event', at(day, 9 * 60), at(day, 10 * 60));

    it('takes the rightmost column even when it starts before the event it overlaps', () => {
      const result = layout({
        occurrences: [event],
        draft: { dateKey: day, startMinute: 8 * 60 + 30, endMinute: 9 * 60 + 30 },
      });

      expect(result.draftPlacement).toEqual({ left: 0.5, width: 0.5 });
      expect(summary(result)).toEqual([
        { key: 'event', column: 0, left: 0, width: 0.5, startMinute: 540, endMinute: 600 },
      ]);
    });

    it('takes no column during a drag selection, on another day, or when all-day', () => {
      const draft = { dateKey: day, startMinute: 9 * 60, endMinute: 10 * 60 };
      const cases = [
        layout({ occurrences: [event], draft, hasDragSelection: true }),
        layout({ occurrences: [event], draft: { ...draft, dateKey: nextDay } }),
        layout({ occurrences: [event], draft: { dateKey: day, allDay: true } }),
      ];

      for (const result of cases) {
        expect(result.draftPlacement).toBeUndefined();
        expect(result.events[0]).toMatchObject({ left: 0, width: 1 });
      }
    });
  });
});
