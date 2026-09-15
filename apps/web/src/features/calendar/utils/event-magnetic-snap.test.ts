import type { Calendar, CalendarEvent, WorkingHours } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  collectMagneticTargets,
  DEFAULT_MAGNETIC_THRESHOLD_MINUTES,
  snapMoveInterval,
  snapResizeInterval,
  type MagneticTarget,
} from './event-magnetic-snap';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

const mockCalendar: Calendar = {
  id: 'b0000000-0000-0000-0000-000000000001',
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

function createMockOccurrence(
  id: string,
  title: string,
  startIso: string,
  endIso: string,
  allDay = false,
): EventOccurrence {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const event: CalendarEvent = {
    id,
    userId: mockCalendar.userId,
    calendarId: mockCalendar.id,
    title,
    description: null,
    location: null,
    startAt: startIso,
    endAt: endIso,
    timezone: 'UTC',
    allDay,
    recurrenceRule: null,
    recurrenceOriginalStartAt: null,
    recurringEventId: null,
    status: 'confirmed',
    alerts: [],
    sourceType: 'internal',
    providerEventId: null,
    providerEtag: null,
    providerUpdatedAt: null,
    syncStatus: 'synced',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    key: `key-${id}`,
    occurrenceIndex: 0,
    event,
    calendar: mockCalendar,
    start,
    end,
  };
}

describe('event-magnetic-snap', () => {
  const timeZone = 'UTC';
  const dateKey = '2026-09-15'; // 2026-09-15 is a Tuesday (weekday 2)

  const workingHours: WorkingHours = [
    {
      weekday: 2, // Tuesday
      startMinute: 540, // 09:00
      endMinute: 1020, // 17:00
    },
  ];

  it('exports a restrained default magnetic threshold of 7 minutes', () => {
    expect(DEFAULT_MAGNETIC_THRESHOLD_MINUTES).toBe(7);
  });

  describe('collectMagneticTargets', () => {
    it('collects start and end boundaries of visible timed events on active day', () => {
      const occurrences = [
        createMockOccurrence(
          'ev-1',
          'Morning Standup',
          '2026-09-15T10:00:00Z',
          '2026-09-15T10:30:00Z',
        ),
        createMockOccurrence('ev-2', 'Lunch Sync', '2026-09-15T12:00:00Z', '2026-09-15T13:00:00Z'),
      ];

      const targets = collectMagneticTargets({
        occurrences,
        activeOccurrenceKey: null,
        dateKey,
        timeZone,
      });

      expect(targets).toEqual([
        { minute: 600, type: 'event-start', label: 'Morning Standup' }, // 10:00
        { minute: 630, type: 'event-end', label: 'Morning Standup' }, // 10:30
        { minute: 720, type: 'event-start', label: 'Lunch Sync' }, // 12:00
        { minute: 780, type: 'event-end', label: 'Lunch Sync' }, // 13:00
      ]);
    });

    it('ignores active event itself', () => {
      const occurrences = [
        createMockOccurrence(
          'ev-1',
          'Active Event',
          '2026-09-15T10:00:00Z',
          '2026-09-15T11:00:00Z',
        ),
        createMockOccurrence('ev-2', 'Other Event', '2026-09-15T14:00:00Z', '2026-09-15T15:00:00Z'),
      ];

      const targets = collectMagneticTargets({
        occurrences,
        activeOccurrenceKey: 'key-ev-1',
        dateKey,
        timeZone,
      });

      expect(targets.map((t) => t.minute)).toEqual([840, 900]);
    });

    it('ignores all-day events', () => {
      const occurrences = [
        createMockOccurrence(
          'ev-all-day',
          'Company Holiday',
          '2026-09-15T00:00:00Z',
          '2026-09-15T23:59:59Z',
          true,
        ),
        createMockOccurrence(
          'ev-timed',
          'One-on-one',
          '2026-09-15T15:00:00Z',
          '2026-09-15T15:30:00Z',
        ),
      ];

      const targets = collectMagneticTargets({
        occurrences,
        activeOccurrenceKey: null,
        dateKey,
        timeZone,
      });

      expect(targets.map((t) => t.minute)).toEqual([900, 930]);
    });

    it('includes working hours boundaries for the active day', () => {
      const targets = collectMagneticTargets({
        occurrences: [],
        activeOccurrenceKey: null,
        dateKey,
        timeZone,
        workingHours,
      });

      expect(targets).toEqual([
        { minute: 540, type: 'working-hours-start', label: 'Working hours start' }, // 09:00
        { minute: 1020, type: 'working-hours-end', label: 'Working hours end' }, // 17:00
      ]);
    });

    it('prioritizes event boundaries when matching identical minute with working hours', () => {
      const occurrences = [
        createMockOccurrence('ev-9am', 'Kickoff', '2026-09-15T09:00:00Z', '2026-09-15T10:00:00Z'),
      ];

      const targets = collectMagneticTargets({
        occurrences,
        activeOccurrenceKey: null,
        dateKey,
        timeZone,
        workingHours,
      });

      const nineAm = targets.find((t) => t.minute === 540);
      expect(nineAm?.type).toBe('event-start');
    });
  });

  describe('snapMoveInterval', () => {
    const targets: MagneticTarget[] = [
      { minute: 600, type: 'event-start', label: 'Target 10:00' }, // 10:00
      { minute: 720, type: 'event-end', label: 'Target 12:00' }, // 12:00
    ];

    it('chooses nearest eligible target when approaching with start edge', () => {
      // Event original 09:00-10:00 (duration 60m)
      // Moving down by delta = 56m -> rawStart = 596 (4m away from 600)
      const result = snapMoveInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        deltaMinutes: 56,
        targets,
      });

      expect(result.snap).not.toBeNull();
      expect(result.snap?.edge).toBe('start');
      expect(result.snap?.snappedMinute).toBe(600);
      expect(result.interval).toEqual({ startMinute: 600, endMinute: 660 });
    });

    it('chooses nearest eligible target when approaching with end edge', () => {
      // Event original 10:00-11:00 (duration 60m)
      // Moving down by delta = 57m -> rawEnd = 717 (3m away from 720)
      const result = snapMoveInterval({
        originalMinutes: { startMinute: 600, endMinute: 660 },
        deltaMinutes: 57,
        targets,
      });

      expect(result.snap).not.toBeNull();
      expect(result.snap?.edge).toBe('end');
      expect(result.snap?.snappedMinute).toBe(720);
      // Duration strictly preserved: 720 - 60 = 660
      expect(result.interval).toEqual({ startMinute: 660, endMinute: 720 });
    });

    it('preserves duration exactly during move snap', () => {
      const duration = 75; // 1h15m
      const original = { startMinute: 480, endMinute: 480 + duration };
      const result = snapMoveInterval({
        originalMinutes: original,
        deltaMinutes: 118, // rawStart = 598 -> snaps to 600
        targets,
      });

      expect(result.snap?.snappedMinute).toBe(600);
      expect(result.interval.endMinute - result.interval.startMinute).toBe(duration);
    });

    it('ignores targets outside threshold and falls back to standard 15-minute grid', () => {
      // Delta = 40m -> rawStart = 540 + 40 = 580
      // Closest target is 600 (distance = 20m > 7m default threshold)
      const result = snapMoveInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        deltaMinutes: 40,
        targets,
      });

      expect(result.snap).toBeNull();
      // Standard 15m snap: 540 + round(40 / 15) * 15 = 540 + 45 = 585
      expect(result.interval).toEqual({ startMinute: 585, endMinute: 645 });
    });

    it('releases magnetic snap when dragged beyond threshold', () => {
      // Distance 6m from 600 (within threshold 7m)
      const captured = snapMoveInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        deltaMinutes: 54, // rawStart = 594, distance = 6m
        targets,
      });
      expect(captured.snap).not.toBeNull();
      expect(captured.interval.startMinute).toBe(600);

      // Distance 9m from 600 (outside threshold 7m)
      const released = snapMoveInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        deltaMinutes: 51, // rawStart = 591, distance = 9m
        targets,
      });
      expect(released.snap).toBeNull();
      expect(released.interval.startMinute).toBe(585); // fallback to 15m grid
    });

    it('rejects candidate snap that would push event outside active day boundaries', () => {
      const nearMidnightTarget: MagneticTarget[] = [
        { minute: 1430, type: 'event-end', label: 'Late Event' },
      ];
      // Event duration 30m. Snapping start to 1430 would make end = 1460 > 1440.
      const result = snapMoveInterval({
        originalMinutes: { startMinute: 1380, endMinute: 1410 },
        deltaMinutes: 48, // rawStart = 1428 (2m from 1430)
        targets: nearMidnightTarget,
      });

      // Start snap rejected because end would be > 1440; end snap distance is |1458 - 1430| = 28 > 7.
      // So magnetic snap is null, falling back to safe clamped day bounds
      expect(result.snap).toBeNull();
      expect(result.interval.endMinute).toBeLessThanOrEqual(1440);
    });

    it('deterministically breaks ties preferring on-grid targets', () => {
      const tieTargets: MagneticTarget[] = [
        { minute: 600, type: 'event-start', label: 'On grid 10:00' }, // on 15m grid
        { minute: 608, type: 'event-start', label: 'Off grid 10:08' }, // off grid
      ];
      // rawStart = 604 -> distance to 600 is 4, distance to 608 is 4.
      const result = snapMoveInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        deltaMinutes: 64, // rawStart = 604
        targets: tieTargets,
      });

      expect(result.snap?.snappedMinute).toBe(600); // prefers on-grid target
    });
  });

  describe('snapResizeInterval', () => {
    const targets: MagneticTarget[] = [
      { minute: 600, type: 'event-start', label: 'Event 10:00' },
      { minute: 660, type: 'event-end', label: 'Event 11:00' },
    ];

    it('top resize moves only start edge and keeps end fixed', () => {
      // Event original 09:30-11:30 (start 570, end 690)
      // Top resize dragged near 600 (raw = 598)
      const result = snapResizeInterval({
        originalMinutes: { startMinute: 570, endMinute: 690 },
        edge: 'start',
        rawPointerMinute: 598,
        targets,
      });

      expect(result.snap).not.toBeNull();
      expect(result.snap?.edge).toBe('start');
      expect(result.snap?.snappedMinute).toBe(600);
      expect(result.interval.startMinute).toBe(600);
      expect(result.interval.endMinute).toBe(690); // end strictly unchanged
    });

    it('bottom resize moves only end edge and keeps start fixed', () => {
      // Event original 09:00-10:00 (start 540, end 600)
      // Bottom resize dragged near 660 (raw = 663)
      const result = snapResizeInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        edge: 'end',
        rawPointerMinute: 663,
        targets,
      });

      expect(result.snap).not.toBeNull();
      expect(result.snap?.edge).toBe('end');
      expect(result.snap?.snappedMinute).toBe(660);
      expect(result.interval.startMinute).toBe(540); // start strictly unchanged
      expect(result.interval.endMinute).toBe(660);
    });

    it('rejects candidate snap that violates minimum duration (15m)', () => {
      // Event end is fixed at 600. Target is at 590 (only 10m duration).
      const closeTarget: MagneticTarget[] = [
        { minute: 590, type: 'event-start', label: 'Too close' },
      ];
      const result = snapResizeInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        edge: 'start',
        rawPointerMinute: 592,
        targets: closeTarget,
      });

      // Target at 590 would result in duration 10m < 15m. It must be rejected.
      expect(result.snap).toBeNull();
      expect(result.interval.endMinute - result.interval.startMinute).toBeGreaterThanOrEqual(15);
    });

    it('releases resize magnetic snap when pointer moves beyond threshold', () => {
      // Pointer at 605 (distance 5m from 600 <= 7m)
      const captured = snapResizeInterval({
        originalMinutes: { startMinute: 540, endMinute: 690 },
        edge: 'start',
        rawPointerMinute: 605,
        targets,
      });
      expect(captured.snap?.snappedMinute).toBe(600);

      // Pointer at 610 (distance 10m from 600 > 7m)
      const released = snapResizeInterval({
        originalMinutes: { startMinute: 540, endMinute: 690 },
        edge: 'start',
        rawPointerMinute: 610,
        targets,
      });
      expect(released.snap).toBeNull();
      expect(released.interval.startMinute).toBe(615); // standard 15m grid
    });
  });
});
