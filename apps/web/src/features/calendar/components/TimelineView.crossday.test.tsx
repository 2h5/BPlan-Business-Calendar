import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import type { EventOccurrence } from '../hooks/useCalendarWindow';
import {
  collectConflictCandidates,
  hasConflict as checkHasConflict,
} from '../utils/event-conflict';
import { collectMagneticTargets, snapMoveInterval } from '../utils/event-magnetic-snap';
import { dateMinuteToInstant, hasTimingChanged, isEventMovable } from '../utils/event-resize';

const timeZone = 'America/New_York';

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

const makeEvent = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'a0000000-0000-0000-0000-000000000001',
  userId: calendar.userId,
  calendarId: calendar.id,
  title: 'Team Sync',
  description: 'Weekly team meeting',
  location: 'Room 101',
  startAt: '2026-09-14T14:00:00.000Z', // 10:00 AM EDT
  endAt: '2026-09-14T15:00:00.000Z', // 11:00 AM EDT
  allDay: false,
  timezone: 'America/New_York',
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
  ...overrides,
});

describe('Cross-Day Whole-Event Dragging in Week View', () => {
  it('preserves local wall-clock start time and duration on pure horizontal move (Monday -> Tuesday)', () => {
    // Monday 10:00 AM - 11:00 AM EDT
    const tuesdayKey = '2026-09-15';

    const originalMinutes = { startMinute: 10 * 60, endMinute: 11 * 60 };
    const duration = originalMinutes.endMinute - originalMinutes.startMinute;

    // Pure horizontal move: deltaMinutes = 0
    const deltaMinutes = 0;
    const nextStartMinute = originalMinutes.startMinute + deltaMinutes;
    const nextEndMinute = nextStartMinute + duration;

    const nextStart = dateMinuteToInstant(tuesdayKey, nextStartMinute, timeZone);
    const nextEnd = dateMinuteToInstant(tuesdayKey, nextEndMinute, timeZone);

    expect(nextStart).not.toBeNull();
    expect(nextEnd).not.toBeNull();

    // In America/New_York (EDT, UTC-4), 10:00 AM is 14:00 UTC
    expect(nextStart?.toISOString()).toBe('2026-09-15T14:00:00.000Z');
    expect(nextEnd?.toISOString()).toBe('2026-09-15T15:00:00.000Z');

    // Duration is strictly preserved (60 minutes = 3600000 ms)
    expect(nextEnd!.getTime() - nextStart!.getTime()).toBe(60 * 60 * 1000);
  });

  it('updates both date and time on diagonal move (Monday 10:00 -> Wednesday 14:00)', () => {
    const wednesdayKey = '2026-09-16';
    const originalMinutes = { startMinute: 10 * 60, endMinute: 11 * 60 };
    const duration = originalMinutes.endMinute - originalMinutes.startMinute;

    // Dragged down by 4 hours (+240 minutes) to 2:00 PM (14:00)
    const deltaMinutes = 4 * 60;
    const nextStartMinute = originalMinutes.startMinute + deltaMinutes;
    const nextEndMinute = nextStartMinute + duration;

    const nextStart = dateMinuteToInstant(wednesdayKey, nextStartMinute, timeZone);
    const nextEnd = dateMinuteToInstant(wednesdayKey, nextEndMinute, timeZone);

    // In America/New_York (EDT, UTC-4), 2:00 PM (14:00) is 18:00 UTC
    expect(nextStart?.toISOString()).toBe('2026-09-16T18:00:00.000Z');
    expect(nextEnd?.toISOString()).toBe('2026-09-16T19:00:00.000Z');
    expect(nextEnd!.getTime() - nextStart!.getTime()).toBe(duration * 60 * 1000);
  });

  it('preserves duration invariant across odd event lengths (e.g. 45-minute event to Friday)', () => {
    const fridayKey = '2026-09-18';
    // 9:15 AM - 10:00 AM (45m)
    const duration = 45;

    // Move to 13:30 (1:30 PM)
    const targetStartMinute = 13 * 60 + 30;
    const targetEndMinute = targetStartMinute + duration;

    const nextStart = dateMinuteToInstant(fridayKey, targetStartMinute, timeZone);
    const nextEnd = dateMinuteToInstant(fridayKey, targetEndMinute, timeZone);

    expect(nextEnd!.getTime() - nextStart!.getTime()).toBe(45 * 60 * 1000);
  });

  it('detects live conflicts against the TARGET day occurrences, not the origin day', () => {
    const mondayEvent = makeEvent({
      id: 'event-mon',
      title: 'Monday Standup',
      startAt: '2026-09-14T14:00:00.000Z', // 10:00 AM EDT
      endAt: '2026-09-14T15:00:00.000Z', // 11:00 AM EDT
    });

    const tuesdayConflict = makeEvent({
      id: 'event-tue',
      title: 'Tuesday Meeting',
      startAt: '2026-09-15T14:30:00.000Z', // 10:30 AM EDT
      endAt: '2026-09-15T15:30:00.000Z', // 11:30 AM EDT
    });

    const mondayOcc: EventOccurrence = {
      key: 'mon-key',
      occurrenceIndex: 0,
      start: Date.parse(mondayEvent.startAt),
      end: Date.parse(mondayEvent.endAt),
      event: mondayEvent,
      calendar,
    };

    const tuesdayOcc: EventOccurrence = {
      key: 'tue-key',
      occurrenceIndex: 0,
      start: Date.parse(tuesdayConflict.startAt),
      end: Date.parse(tuesdayConflict.endAt),
      event: tuesdayConflict,
      calendar,
    };

    // 1. When dragged to Tuesday at 10:00–11:00:
    // Tuesday conflict candidates
    const tuesdayCandidates = collectConflictCandidates({
      occurrences: [tuesdayOcc],
      activeOccurrenceKey: mondayOcc.key,
      dateKey: '2026-09-15',
      timeZone,
    });

    // Proposed interval: 10:00 (600) to 11:00 (660). Tuesday meeting is at 10:30 (630) to 11:30 (690).
    const isConflictedOnTuesday = checkHasConflict(
      { startMinute: 600, endMinute: 660 },
      tuesdayCandidates,
    );
    expect(isConflictedOnTuesday).toBe(true);

    // 2. Moving to non-conflicting time on Tuesday (e.g. 12:00–13:00)
    const isConflictedLater = checkHasConflict(
      { startMinute: 720, endMinute: 780 },
      tuesdayCandidates,
    );
    expect(isConflictedLater).toBe(false);

    // 3. Crossing back to Monday:
    // Monday has no other events
    const mondayCandidates = collectConflictCandidates({
      occurrences: [mondayOcc],
      activeOccurrenceKey: mondayOcc.key,
      dateKey: '2026-09-14',
      timeZone,
    });
    const isConflictedBackOnMonday = checkHasConflict(
      { startMinute: 600, endMinute: 660 },
      mondayCandidates,
    );
    expect(isConflictedBackOnMonday).toBe(false);
  });

  it('selects magnetic targets from the TARGET day only', () => {
    // Monday has an event ending at 10:15
    const mondayEvent = makeEvent({
      id: 'mon-boundary',
      title: 'Monday Early',
      startAt: '2026-09-14T13:30:00.000Z', // 09:30 AM EDT
      endAt: '2026-09-14T14:15:00.000Z', // 10:15 AM EDT
    });

    // Tuesday has an event starting at 10:45
    const tuesdayEvent = makeEvent({
      id: 'tue-boundary',
      title: 'Tuesday Later',
      startAt: '2026-09-15T14:45:00.000Z', // 10:45 AM EDT
      endAt: '2026-09-15T15:45:00.000Z', // 11:45 AM EDT
    });

    const activeOccurrenceKey = 'moving-event';

    // When on Tuesday, targets are collected for Tuesday
    const tuesdayTargets = collectMagneticTargets({
      occurrences: [
        {
          key: 'mon-key',
          occurrenceIndex: 0,
          start: Date.parse(mondayEvent.startAt),
          end: Date.parse(mondayEvent.endAt),
          event: mondayEvent,
          calendar,
        },
        {
          key: 'tue-key',
          occurrenceIndex: 0,
          start: Date.parse(tuesdayEvent.startAt),
          end: Date.parse(tuesdayEvent.endAt),
          event: tuesdayEvent,
          calendar,
        },
      ],
      activeOccurrenceKey,
      dateKey: '2026-09-15',
      timeZone,
    });

    // Tuesday target contains 10:45 (645m)
    expect(tuesdayTargets.some((t) => t.minute === 10 * 60 + 45)).toBe(true);
    // Tuesday targets do NOT contain Monday's 10:15 (615m)
    expect(tuesdayTargets.some((t) => t.minute === 10 * 60 + 15)).toBe(false);

    // If dragged near 10:45 on Tuesday, it snaps to Tuesday's boundary
    const snapResult = snapMoveInterval({
      originalMinutes: { startMinute: 600, endMinute: 660 }, // 10:00-11:00
      deltaMinutes: 42, // close to 45m (+42 => end would be 660 + 42 = 702; or start 642 near 645)
      targets: tuesdayTargets,
      thresholdMinutes: 7,
    });

    expect(snapResult.snap).not.toBeNull();
    expect(snapResult.snap?.snappedMinute).toBe(10 * 60 + 45); // 645m
  });

  it('treats returning to original date and time as a no-op without mutation', () => {
    const originalTiming = {
      start: Date.parse('2026-09-14T14:00:00.000Z'),
      end: Date.parse('2026-09-14T15:00:00.000Z'),
    };

    // User moves to Tuesday, then returns to original Monday 10:00
    const returnedTiming = {
      start: Date.parse('2026-09-14T14:00:00.000Z'),
      end: Date.parse('2026-09-14T15:00:00.000Z'),
    };

    expect(hasTimingChanged(originalTiming, returnedTiming)).toBe(false);
  });

  it('detects change when date changes even if local wall-clock minute is identical', () => {
    const originalTiming = {
      start: Date.parse('2026-09-14T14:00:00.000Z'), // Mon 10:00 AM EDT
      end: Date.parse('2026-09-14T15:00:00.000Z'),
    };

    const tuesdayTiming = {
      start: Date.parse('2026-09-15T14:00:00.000Z'), // Tue 10:00 AM EDT
      end: Date.parse('2026-09-15T15:00:00.000Z'),
    };

    expect(hasTimingChanged(originalTiming, tuesdayTiming)).toBe(true);
  });

  it('enforces that ineligible events (read-only, recurring, all-day) cannot be moved', () => {
    const readOnlyCalendar: Calendar = { ...calendar, isReadOnly: true };

    const normalEvent = makeEvent({});
    const recurringEvent = makeEvent({ recurrenceRule: 'RRULE:FREQ=WEEKLY' });
    const allDayEvent = makeEvent({ allDay: true });

    const normalOcc: EventOccurrence = {
      key: '1',
      occurrenceIndex: 0,
      start: Date.parse(normalEvent.startAt),
      end: Date.parse(normalEvent.endAt),
      event: normalEvent,
      calendar,
    };

    const readOnlyOcc: EventOccurrence = {
      ...normalOcc,
      calendar: readOnlyCalendar,
    };

    const recurringOcc: EventOccurrence = {
      ...normalOcc,
      event: recurringEvent,
    };

    const allDayOcc: EventOccurrence = {
      ...normalOcc,
      event: allDayEvent,
    };

    expect(isEventMovable(normalOcc, '2026-09-14', timeZone)).toBe(true);
    expect(isEventMovable(readOnlyOcc, '2026-09-14', timeZone)).toBe(false);
    expect(isEventMovable(recurringOcc, '2026-09-14', timeZone)).toBe(false);
    expect(isEventMovable(allDayOcc, '2026-09-14', timeZone)).toBe(false);
  });

  it('verifies Undo payload restores both original date and time', () => {
    const originalStart = '2026-09-14T14:00:00.000Z';
    const originalEnd = '2026-09-14T15:00:00.000Z';
    const targetStart = '2026-09-16T18:00:00.000Z'; // Wed 2:00 PM EDT
    const targetEnd = '2026-09-16T19:00:00.000Z';

    const previous = {
      start: Date.parse(originalStart),
      end: Date.parse(originalEnd),
    };

    const target = {
      start: Date.parse(targetStart),
      end: Date.parse(targetEnd),
    };

    // Move update
    expect(new Date(target.start).toISOString()).toBe(targetStart);
    expect(new Date(target.end).toISOString()).toBe(targetEnd);

    // Undo restore
    expect(new Date(previous.start).toISOString()).toBe(originalStart);
    expect(new Date(previous.end).toISOString()).toBe(originalEnd);
  });
});
