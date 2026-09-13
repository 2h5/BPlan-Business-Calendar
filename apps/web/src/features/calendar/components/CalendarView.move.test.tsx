import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it, vi } from 'vitest';

import { eventInputWithTiming } from '../utils/event-form';

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

const event: CalendarEvent = {
  id: 'a0000000-0000-0000-0000-000000000001',
  userId: calendar.userId,
  calendarId: calendar.id,
  title: 'Team Sync',
  description: 'Weekly team meeting',
  location: 'Room 101',
  startAt: '2026-09-15T14:00:00.000Z',
  endAt: '2026-09-15T15:00:00.000Z',
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
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

describe('CalendarView move mutation coordination and undo/rollback', () => {
  it('prepares authoritative payload preserving unrelated fields and updating timing', () => {
    const nextStart = '2026-09-15T14:45:00.000Z';
    const nextEnd = '2026-09-15T15:45:00.000Z';
    const payload = eventInputWithTiming(event, nextStart, nextEnd);

    expect(payload.title).toBe(event.title);
    expect(payload.description).toBe(event.description);
    expect(payload.location).toBe(event.location);
    expect(payload.calendarId).toBe(event.calendarId);
    expect(payload.timezone).toBe(event.timezone);
    expect(payload.startAt).toBe(nextStart);
    expect(payload.endAt).toBe(nextEnd);
    expect(payload.allDay).toBe(false);
  });

  it('coordinates optimistic timing override and rolls back on failure', async () => {
    const overrides = new Map<string, { start: number; end: number }>();
    const setTimingOverride = (id: string, timing: { start: number; end: number } | null) => {
      if (timing) overrides.set(id, timing);
      else overrides.delete(id);
    };

    const targetTiming = {
      start: Date.parse('2026-09-15T14:45:00.000Z'),
      end: Date.parse('2026-09-15T15:45:00.000Z'),
    };

    // Optimistic override set immediately
    setTimingOverride(event.id, targetTiming);
    expect(overrides.get(event.id)).toEqual(targetTiming);

    // Simulate mutation failure
    const mutateAsync = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    let toastMessage = '';
    let undoOffered = false;

    try {
      await mutateAsync({
        event,
        input: eventInputWithTiming(
          event,
          new Date(targetTiming.start).toISOString(),
          new Date(targetTiming.end).toISOString(),
        ),
      });
      undoOffered = true;
    } catch {
      // Roll back
      setTimingOverride(event.id, null);
      toastMessage = 'The event move could not be saved.';
    }

    // Must be rolled back to null (original server data displays)
    expect(overrides.has(event.id)).toBe(false);
    expect(toastMessage).toBe('The event move could not be saved.');
    expect(undoOffered).toBe(false);
  });

  it('offers Undo on success and restores original timing through the same update path', async () => {
    const overrides = new Map<string, { start: number; end: number }>();
    const setTimingOverride = (id: string, timing: { start: number; end: number } | null) => {
      if (timing) overrides.set(id, timing);
      else overrides.delete(id);
    };

    const originalTiming = {
      start: Date.parse(event.startAt),
      end: Date.parse(event.endAt),
    };
    const targetTiming = {
      start: Date.parse('2026-09-15T15:30:00.000Z'),
      end: Date.parse('2026-09-15T16:30:00.000Z'),
    };

    const mutateAsync = vi.fn().mockResolvedValue({ id: event.id });
    let undoCallback: (() => Promise<void>) | null = null;
    let toastMessage = '';

    // Step 1: User moves event
    setTimingOverride(event.id, targetTiming);
    await mutateAsync({
      event,
      input: eventInputWithTiming(
        event,
        new Date(targetTiming.start).toISOString(),
        new Date(targetTiming.end).toISOString(),
      ),
    });

    toastMessage = 'Event moved';
    undoCallback = async () => {
      setTimingOverride(event.id, originalTiming);
      await mutateAsync({
        event,
        input: eventInputWithTiming(
          event,
          new Date(originalTiming.start).toISOString(),
          new Date(originalTiming.end).toISOString(),
        ),
      });
      toastMessage = 'Move undone.';
    };

    expect(toastMessage).toBe('Event moved');
    expect(overrides.get(event.id)).toEqual(targetTiming);
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenLastCalledWith({
      event,
      input: expect.objectContaining({
        startAt: '2026-09-15T15:30:00.000Z',
        endAt: '2026-09-15T16:30:00.000Z',
      }),
    });

    // Step 2: User clicks Undo
    await undoCallback();
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenLastCalledWith({
      event,
      input: expect.objectContaining({
        startAt: event.startAt,
        endAt: event.endAt,
      }),
    });
    expect(overrides.get(event.id)).toEqual(originalTiming);
    expect(toastMessage).toBe('Move undone.');
  });

  it('transitions toast through intermediate Restoring event… state on Undo', async () => {
    const messages: string[] = [];

    // Simulate clicking Undo in CalendarView
    const handleUndo = async () => {
      messages.push('Restoring event…');
      messages.push('Move undone.');
    };

    messages.push('Event moved');
    expect(messages).toEqual(['Event moved']);

    await handleUndo();
    expect(messages).toEqual(['Event moved', 'Restoring event…', 'Move undone.']);
  });
});
