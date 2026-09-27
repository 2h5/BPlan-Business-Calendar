import type { Calendar, CalendarEvent } from '@cal/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useCalendarEventTimingChanges } from '../hooks/useCalendarEventTimingChanges';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
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
  color: null,
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

const occurrence: EventOccurrence = {
  key: `${event.id}:0:${Date.parse(event.startAt)}`,
  event,
  calendar,
  start: Date.parse(event.startAt),
  end: Date.parse(event.endAt),
  occurrenceIndex: 0,
};

const targetTiming = {
  start: Date.parse('2026-09-15T14:45:00.000Z'),
  end: Date.parse('2026-09-15T15:45:00.000Z'),
};

type TimingChangeOptions = Parameters<typeof useCalendarEventTimingChanges>[0];

function renderHandlers(options: TimingChangeOptions) {
  let handlers: ReturnType<typeof useCalendarEventTimingChanges> | undefined;
  function Harness() {
    handlers = useCalendarEventTimingChanges(options);
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return handlers!;
}

function setup(timingOverrides: TimingChangeOptions['timingOverrides'] = new Map()) {
  const setTimingOverride = vi.fn<TimingChangeOptions['setTimingOverride']>();
  const mutateAsync = vi.fn<TimingChangeOptions['updateEvent']['mutateAsync']>();
  mutateAsync.mockResolvedValue(undefined);
  const showToast = vi.fn<TimingChangeOptions['showToast']>();
  const showSuccess = vi.fn<TimingChangeOptions['showSuccess']>();
  const refetch = vi.fn<TimingChangeOptions['refetch']>();
  const handlers = renderHandlers({
    timingOverrides,
    setTimingOverride,
    updateEvent: { mutateAsync },
    showToast,
    showSuccess,
    refetch,
  });
  return { handlers, setTimingOverride, mutateAsync, showToast, showSuccess, refetch };
}

function undoAction(showToast: ReturnType<typeof setup>['showToast']) {
  const onAction = showToast.mock.calls[0]?.[0].onAction;
  if (!onAction) throw new Error('Expected an Undo action on the success toast.');
  return onAction;
}

describe('CalendarView event timing mutation coordination', () => {
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

  const cases = [
    {
      kind: 'move',
      success: 'Event moved',
      undone: 'Move undone.',
      saveError: 'The event move could not be saved.',
      undoError: 'The move could not be undone.',
    },
    {
      kind: 'resize',
      success: 'Event resized',
      undone: 'Resize undone.',
      saveError: 'The event resize could not be saved.',
      undoError: 'The resize could not be undone.',
    },
  ] as const;

  describe.each(cases)('$kind', ({ kind, success, undone, saveError, undoError }) => {
    function handler(handlers: ReturnType<typeof useCalendarEventTimingChanges>) {
      return kind === 'move' ? handlers.handleMoveEvent : handlers.handleResizeEvent;
    }

    it('does nothing when timing is unchanged', () => {
      const state = setup();
      handler(state.handlers)(occurrence, { start: occurrence.start, end: occurrence.end });

      expect(state.setTimingOverride).not.toHaveBeenCalled();
      expect(state.mutateAsync).not.toHaveBeenCalled();
      expect(state.showToast).not.toHaveBeenCalled();
    });

    it('sets the optimistic timing before persisting the existing update payload', async () => {
      const state = setup();
      let resolveMutation: ((value: CalendarEvent | undefined) => void) | undefined;
      const pending = new Promise<CalendarEvent | undefined>((resolve) => {
        resolveMutation = resolve;
      });
      state.mutateAsync.mockImplementationOnce(() => pending);

      handler(state.handlers)(occurrence, targetTiming);

      expect(state.setTimingOverride).toHaveBeenCalledWith(event.id, targetTiming);
      expect(state.setTimingOverride.mock.invocationCallOrder[0]!).toBeLessThan(
        state.mutateAsync.mock.invocationCallOrder[0]!,
      );
      expect(state.mutateAsync).toHaveBeenCalledWith({
        event,
        input: eventInputWithTiming(event, '2026-09-15T14:45:00.000Z', '2026-09-15T15:45:00.000Z'),
      });
      expect(state.showToast).not.toHaveBeenCalled();

      resolveMutation?.(undefined);
      await vi.waitFor(() => expect(state.showToast).toHaveBeenCalledOnce());
      expect(state.showToast).toHaveBeenCalledWith({
        message: success,
        actionLabel: 'Undo',
        onAction: expect.any(Function),
      });
    });

    it('clears the override and shows the save error without refetching on initial failure', async () => {
      const state = setup();
      state.mutateAsync.mockRejectedValueOnce(new Error('Network error'));

      handler(state.handlers)(occurrence, targetTiming);

      await vi.waitFor(() => expect(state.showToast).toHaveBeenCalledWith({ message: saveError }));
      expect(state.setTimingOverride.mock.calls).toEqual([
        [event.id, targetTiming],
        [event.id, null],
      ]);
      expect(state.refetch).not.toHaveBeenCalled();
      expect(state.showSuccess).not.toHaveBeenCalled();
    });

    it('offers Undo after success, immediately restores timing, and persists the previous value', async () => {
      const state = setup();
      handler(state.handlers)(occurrence, targetTiming);
      await vi.waitFor(() => expect(state.showToast).toHaveBeenCalledOnce());

      const undo = undoAction(state.showToast);
      const previous = { start: occurrence.start, end: occurrence.end };
      let resolveUndo: ((value: CalendarEvent | undefined) => void) | undefined;
      state.mutateAsync.mockImplementationOnce(
        () =>
          new Promise<CalendarEvent | undefined>((resolve) => {
            resolveUndo = resolve;
          }),
      );

      undo();

      expect(state.setTimingOverride).toHaveBeenLastCalledWith(event.id, previous);
      expect(state.showToast).toHaveBeenLastCalledWith({ message: 'Restoring event…' });
      expect(state.mutateAsync).toHaveBeenCalledTimes(2);
      expect(state.mutateAsync).toHaveBeenLastCalledWith({
        event,
        input: eventInputWithTiming(event, event.startAt, event.endAt),
      });
      expect(state.setTimingOverride.mock.invocationCallOrder[1]!).toBeLessThan(
        state.mutateAsync.mock.invocationCallOrder[1]!,
      );
      expect(state.showSuccess).not.toHaveBeenCalled();

      resolveUndo?.(undefined);
      await vi.waitFor(() => expect(state.showSuccess).toHaveBeenCalledWith(undone));
      expect(state.refetch).not.toHaveBeenCalled();
    });

    it('clears the override, refetches once, and shows the Undo error on failure', async () => {
      const state = setup();
      handler(state.handlers)(occurrence, targetTiming);
      await vi.waitFor(() => expect(state.showToast).toHaveBeenCalledOnce());
      state.mutateAsync.mockRejectedValueOnce(new Error('Undo failed'));

      undoAction(state.showToast)();

      await vi.waitFor(() =>
        expect(state.showToast).toHaveBeenLastCalledWith({ message: undoError }),
      );
      expect(state.setTimingOverride).toHaveBeenLastCalledWith(event.id, null);
      expect(state.refetch).toHaveBeenCalledOnce();
      expect(state.showSuccess).not.toHaveBeenCalled();
      expect(state.showToast.mock.calls.map(([toast]) => toast.message)).toEqual([
        success,
        'Restoring event…',
        undoError,
      ]);
    });
  });

  it('prefers an existing optimistic override as the previous timing for Undo', async () => {
    const previous = {
      start: Date.parse('2026-09-15T14:15:00.000Z'),
      end: Date.parse('2026-09-15T15:15:00.000Z'),
    };
    const state = setup(new Map([[event.id, previous]]));
    state.handlers.handleMoveEvent(occurrence, targetTiming);
    await vi.waitFor(() => expect(state.showToast).toHaveBeenCalledOnce());

    undoAction(state.showToast)();

    expect(state.setTimingOverride).toHaveBeenLastCalledWith(event.id, previous);
    expect(state.mutateAsync).toHaveBeenLastCalledWith({
      event,
      input: eventInputWithTiming(
        event,
        new Date(previous.start).toISOString(),
        new Date(previous.end).toISOString(),
      ),
    });
  });
});
