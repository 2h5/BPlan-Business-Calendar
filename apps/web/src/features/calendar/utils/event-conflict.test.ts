import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  collectConflictCandidates,
  findConflictingCandidates,
  hasConflict,
  hasIntervalOverlap,
  type ConflictCandidate,
} from './event-conflict';
import { snapMoveInterval, snapResizeInterval } from './event-magnetic-snap';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

const mockCalendar: Calendar = {
  id: 'b0000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Work',
  color: '#4F8DF7',
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

describe('event-conflict', () => {
  const timeZone = 'UTC';
  const dateKey = '2026-09-15';

  describe('hasIntervalOverlap', () => {
    it('detects partial overlap when proposed interval starts before other ends', () => {
      // 10:00-11:00 (600-660) vs 10:45-11:45 (645-705)
      expect(
        hasIntervalOverlap(
          { startMinute: 645, endMinute: 705 },
          { startMinute: 600, endMinute: 660 },
        ),
      ).toBe(true);
    });

    it('detects partial overlap when proposed interval ends after other starts', () => {
      // 10:00-11:00 (600-660) vs 09:30-10:15 (570-615)
      expect(
        hasIntervalOverlap(
          { startMinute: 570, endMinute: 615 },
          { startMinute: 600, endMinute: 660 },
        ),
      ).toBe(true);
    });

    it('detects complete overlap when proposed interval is enclosed by other', () => {
      // 10:00-12:00 (600-720) vs 10:30-11:30 (630-690)
      expect(
        hasIntervalOverlap(
          { startMinute: 630, endMinute: 690 },
          { startMinute: 600, endMinute: 720 },
        ),
      ).toBe(true);
    });

    it('detects complete overlap when proposed interval encloses other', () => {
      // 10:30-11:30 (630-690) vs 10:00-12:00 (600-720)
      expect(
        hasIntervalOverlap(
          { startMinute: 600, endMinute: 720 },
          { startMinute: 630, endMinute: 690 },
        ),
      ).toBe(true);
    });

    it('returns false for exact touching boundaries (adjacent before and after)', () => {
      // 10:00-11:00 (600-660) vs 11:00-12:00 (660-720) -> abutting end/start
      expect(
        hasIntervalOverlap(
          { startMinute: 600, endMinute: 660 },
          { startMinute: 660, endMinute: 720 },
        ),
      ).toBe(false);

      // 11:00-12:00 (660-720) vs 10:00-11:00 (600-660) -> abutting start/end
      expect(
        hasIntervalOverlap(
          { startMinute: 660, endMinute: 720 },
          { startMinute: 600, endMinute: 660 },
        ),
      ).toBe(false);
    });

    it('returns false for completely disjoint intervals', () => {
      // 08:00-09:00 (480-540) vs 10:00-11:00 (600-660)
      expect(
        hasIntervalOverlap(
          { startMinute: 480, endMinute: 540 },
          { startMinute: 600, endMinute: 660 },
        ),
      ).toBe(false);
    });
  });

  describe('collectConflictCandidates', () => {
    it('ignores active event itself', () => {
      const occurrences = [
        createMockOccurrence('ev-1', 'Active Drag', '2026-09-15T10:00:00Z', '2026-09-15T11:00:00Z'),
        createMockOccurrence('ev-2', 'Other Sync', '2026-09-15T14:00:00Z', '2026-09-15T15:00:00Z'),
      ];

      const candidates = collectConflictCandidates({
        occurrences,
        activeOccurrenceKey: 'key-ev-1',
        dateKey,
        timeZone,
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.key).toBe('key-ev-2');
    });

    it('ignores all-day events', () => {
      const occurrences = [
        createMockOccurrence(
          'ev-all-day',
          'Company Offsite',
          '2026-09-15T00:00:00Z',
          '2026-09-15T23:59:59Z',
          true,
        ),
        createMockOccurrence(
          'ev-timed',
          'One-on-one',
          '2026-09-15T15:00:00Z',
          '2026-09-15T16:00:00Z',
        ),
      ];

      const candidates = collectConflictCandidates({
        occurrences,
        activeOccurrenceKey: null,
        dateKey,
        timeZone,
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.key).toBe('key-ev-timed');
    });
  });

  describe('hasConflict and findConflictingCandidates', () => {
    const candidates: ConflictCandidate[] = [
      { key: 'meeting-1', title: 'Team Sync', startMinute: 600, endMinute: 660 }, // 10:00-11:00
      { key: 'meeting-2', title: 'Design Review', startMinute: 780, endMinute: 840 }, // 13:00-14:00
    ];

    it('identifies conflicting candidate when overlapping', () => {
      const proposed = { startMinute: 630, endMinute: 690 }; // 10:30-11:30
      expect(hasConflict(proposed, candidates)).toBe(true);

      const conflicts = findConflictingCandidates(proposed, candidates);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.key).toBe('meeting-1');
    });

    it('returns false and clears conflict when moving away', () => {
      // Moved to 11:30-12:30 (690-750) between meeting-1 and meeting-2
      const proposed = { startMinute: 690, endMinute: 750 };
      expect(hasConflict(proposed, candidates)).toBe(false);
      expect(findConflictingCandidates(proposed, candidates)).toHaveLength(0);
    });

    it('handles multiple overlapping candidates simultaneously', () => {
      // Long meeting 09:00-15:00 overlapping both candidates
      const proposed = { startMinute: 540, endMinute: 900 };
      expect(hasConflict(proposed, candidates)).toBe(true);
      expect(findConflictingCandidates(proposed, candidates)).toHaveLength(2);
    });
  });

  describe('integration with magnetic snapping and move/resize gestures', () => {
    const candidates: ConflictCandidate[] = [
      { key: 'existing-meeting', title: 'Existing Meeting', startMinute: 600, endMinute: 660 }, // 10:00-11:00
    ];

    it('evaluates conflict on the final proposed interval after magnetic snapping during move', () => {
      // Event original 09:00-10:00 (duration 60m).
      // Magnetic target at 600 (start of existing meeting).
      // Delta = 56m -> rawStart = 596.
      // Magnetic snap catches start at 600 -> proposed interval becomes { startMinute: 600, endMinute: 660 }.
      // Since existing-meeting is ALSO 600-660, they completely overlap -> conflict!
      const snapResult = snapMoveInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        deltaMinutes: 56,
        targets: [{ minute: 600, type: 'event-start', label: 'Existing Meeting' }],
      });

      expect(snapResult.interval).toEqual({ startMinute: 600, endMinute: 660 });
      expect(hasConflict(snapResult.interval, candidates)).toBe(true);

      // Now move down so event snaps start to 660 (end of existing meeting):
      // Delta = 118m -> rawStart = 658 -> snaps start to 660.
      // Proposed interval becomes { startMinute: 660, endMinute: 720 }.
      // Abutting boundary (660 === 660) -> NO conflict!
      const abuttingSnapResult = snapMoveInterval({
        originalMinutes: { startMinute: 540, endMinute: 600 },
        deltaMinutes: 118,
        targets: [{ minute: 660, type: 'event-end', label: 'Existing Meeting' }],
      });

      expect(abuttingSnapResult.interval).toEqual({ startMinute: 660, endMinute: 720 });
      expect(hasConflict(abuttingSnapResult.interval, candidates)).toBe(false);
    });

    it('detects top resize conflict when expanded into another event', () => {
      // Original 11:30-12:30 (start 690, end 750).
      // Existing meeting 10:00-11:00 (600-660).
      // Top resize expanded up to 10:30 (start 630, end 750).
      // Overlaps existing meeting (630 < 660 && 750 > 600) -> conflict!
      const snapResult = snapResizeInterval({
        originalMinutes: { startMinute: 690, endMinute: 750 },
        edge: 'start',
        rawPointerMinute: 630,
        targets: [],
      });

      expect(snapResult.interval).toEqual({ startMinute: 630, endMinute: 750 });
      expect(hasConflict(snapResult.interval, candidates)).toBe(true);

      // Top resize shrunk to 11:00 (start 660, end 750) -> abutting at 660 -> NO conflict!
      const abuttingResize = snapResizeInterval({
        originalMinutes: { startMinute: 690, endMinute: 750 },
        edge: 'start',
        rawPointerMinute: 660,
        targets: [],
      });

      expect(abuttingResize.interval).toEqual({ startMinute: 660, endMinute: 750 });
      expect(hasConflict(abuttingResize.interval, candidates)).toBe(false);
    });

    it('detects bottom resize conflict when expanded into another event', () => {
      // Original 08:30-09:30 (start 510, end 570).
      // Existing meeting 10:00-11:00 (600-660).
      // Bottom resize expanded down to 10:30 (start 510, end 630).
      // Overlaps existing meeting (510 < 660 && 630 > 600) -> conflict!
      const snapResult = snapResizeInterval({
        originalMinutes: { startMinute: 510, endMinute: 570 },
        edge: 'end',
        rawPointerMinute: 630,
        targets: [],
      });

      expect(snapResult.interval).toEqual({ startMinute: 510, endMinute: 630 });
      expect(hasConflict(snapResult.interval, candidates)).toBe(true);

      // Bottom resize stopped at 10:00 (start 510, end 600) -> abutting at 600 -> NO conflict!
      const abuttingResize = snapResizeInterval({
        originalMinutes: { startMinute: 510, endMinute: 570 },
        edge: 'end',
        rawPointerMinute: 600,
        targets: [],
      });

      expect(abuttingResize.interval).toEqual({ startMinute: 510, endMinute: 600 });
      expect(hasConflict(abuttingResize.interval, candidates)).toBe(false);
    });
  });
});
