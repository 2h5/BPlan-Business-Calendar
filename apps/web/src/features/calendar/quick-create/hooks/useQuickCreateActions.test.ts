import type { Calendar, CalendarEvent } from '@cal/schemas';
import type { FormEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuickCreateActions } from './useQuickCreateActions';
import type { EventOccurrence } from '../../utils/calendar-occurrences';

type Options = Parameters<typeof useQuickCreateActions>[0];

const event = {
  id: 'event-1',
  calendarId: '00000000-0000-4000-8000-000000000001',
  recurrenceRule: 'FREQ=DAILY',
  alerts: [15, 30],
} as CalendarEvent;
const editingOccurrence = { event } as EventOccurrence;

function makeOptions(overrides: Partial<Options> = {}) {
  const focus = vi.fn();
  const options: Options = {
    mode: 'event',
    title: '  Planning  ',
    startDate: '2026-09-15',
    endDate: '2026-09-15',
    allDay: false,
    startTime: '10:00',
    endTime: '11:00',
    location: '  Room 2  ',
    description: '  Notes  ',
    calendarId: '00000000-0000-4000-8000-000000000001',
    selectedListId: 'list-1',
    taskPriority: 'high',
    taskHasTime: true,
    editingOccurrence: null,
    defaultCalendar: { id: '00000000-0000-4000-8000-000000000002' } as Calendar,
    timeZone: 'America/New_York',
    isSaving: false,
    titleInputRef: { current: { focus } as unknown as HTMLInputElement },
    setErrorMessage: vi.fn(),
    setIsDeleteConfirmOpen: vi.fn(),
    onClose: vi.fn(),
    onCreateEvent: vi.fn(async () => {}),
    onUpdateEvent: vi.fn(async () => {}),
    onDeleteEvent: vi.fn(async () => {}),
    onCreateTask: vi.fn(async () => {}),
    ...overrides,
  };
  return { options, focus };
}

describe('useQuickCreateActions', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ['event', 'Give the event a title'],
    ['task', 'What needs doing?'],
  ] as const)(
    'rejects a blank %s title, focuses it, and does not mutate',
    async (mode, message) => {
      const { options, focus } = makeOptions({ mode, title: '  ' });
      const preventDefault = vi.fn();
      const formEvent = { preventDefault } as unknown as FormEvent;

      await useQuickCreateActions(options).handleSubmit(formEvent);

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(options.setErrorMessage).toHaveBeenNthCalledWith(1, null);
      expect(options.setErrorMessage).toHaveBeenNthCalledWith(2, message);
      expect(focus).toHaveBeenCalledOnce();
      expect(options.onCreateEvent).not.toHaveBeenCalled();
      expect(options.onCreateTask).not.toHaveBeenCalled();
      expect(options.onClose).not.toHaveBeenCalled();
    },
  );

  it('requires a calendar only for event submission', async () => {
    const { options } = makeOptions({ calendarId: '', defaultCalendar: undefined });

    await useQuickCreateActions(options).handleSubmit();

    expect(options.setErrorMessage).toHaveBeenNthCalledWith(1, null);
    expect(options.setErrorMessage).toHaveBeenNthCalledWith(2, 'Select a writable calendar.');
    expect(options.onCreateEvent).not.toHaveBeenCalled();
  });

  it('creates a trimmed event with the fallback calendar, then closes', async () => {
    const { options } = makeOptions({ calendarId: '' });

    await useQuickCreateActions(options).handleSubmit();

    expect(options.onCreateEvent).toHaveBeenCalledWith({
      calendarId: '00000000-0000-4000-8000-000000000002',
      title: 'Planning',
      description: 'Notes',
      location: 'Room 2',
      startAt: '2026-09-15T14:00:00.000Z',
      endAt: '2026-09-15T15:00:00.000Z',
      allDay: false,
      timezone: 'America/New_York',
      recurrenceRule: null,
      alerts: [],
    });
    expect(options.setErrorMessage).toHaveBeenCalledWith(null);
    expect(options.onClose).toHaveBeenCalledOnce();
  });

  it('updates an edited event with its recurrence and cloned alerts', async () => {
    const { options } = makeOptions({ editingOccurrence });

    await useQuickCreateActions(options).handleSubmit();

    expect(options.onCreateEvent).not.toHaveBeenCalled();
    expect(options.onUpdateEvent).toHaveBeenCalledOnce();
    expect(options.onUpdateEvent).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ recurrenceRule: 'FREQ=DAILY', alerts: [15, 30] }),
    );
    const input = vi.mocked(options.onUpdateEvent)?.mock.calls[0]?.[1];
    expect(input?.alerts).not.toBe(event.alerts);
    expect(options.onClose).toHaveBeenCalledOnce();
  });

  it('creates when editing but no update callback exists', async () => {
    const { options } = makeOptions({ editingOccurrence, onUpdateEvent: undefined });

    await useQuickCreateActions(options).handleSubmit();

    expect(options.onCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceRule: 'FREQ=DAILY', alerts: [15, 30] }),
    );
    expect(options.onClose).toHaveBeenCalledOnce();
  });

  it('passes through event Errors and keeps the editing-based non-Error fallbacks', async () => {
    const create = makeOptions({
      onCreateEvent: vi.fn(async () => {
        throw new Error('Create failed');
      }),
    }).options;
    await useQuickCreateActions(create).handleSubmit();
    expect(create.setErrorMessage).toHaveBeenLastCalledWith('Create failed');
    expect(create.onClose).not.toHaveBeenCalled();

    const unknownCreate = makeOptions({
      onCreateEvent: vi.fn(async () => {
        throw 'unknown';
      }),
    }).options;
    await useQuickCreateActions(unknownCreate).handleSubmit();
    expect(unknownCreate.setErrorMessage).toHaveBeenLastCalledWith('Could not create event.');

    const update = makeOptions({
      editingOccurrence,
      onUpdateEvent: vi.fn(async () => {
        throw new Error('Update failed');
      }),
    }).options;
    await useQuickCreateActions(update).handleSubmit();
    expect(update.setErrorMessage).toHaveBeenLastCalledWith('Update failed');
    expect(update.onClose).not.toHaveBeenCalled();

    const fallback = makeOptions({
      editingOccurrence,
      onUpdateEvent: undefined,
      onCreateEvent: vi.fn(async () => {
        throw 'unknown';
      }),
    }).options;
    await useQuickCreateActions(fallback).handleSubmit();
    expect(fallback.setErrorMessage).toHaveBeenLastCalledWith('Could not update event.');
    expect(fallback.onClose).not.toHaveBeenCalled();
  });

  it('creates a timed task with the existing payload and zoned due instant', async () => {
    const { options } = makeOptions({ mode: 'task', startTime: '10:07' });

    await useQuickCreateActions(options).handleSubmit();

    expect(options.onCreateTask).toHaveBeenCalledWith({
      title: 'Planning',
      description: 'Notes',
      listId: 'list-1',
      priority: 'high',
      dueAt: '2026-09-15T14:07:00.000Z',
      hasDueTime: true,
      isFlexible: true,
      tagIds: [],
    });
    expect(options.onClose).toHaveBeenCalledOnce();
  });

  it('uses noon for an untimed task but sends hasDueTime false and null optional fields', async () => {
    const { options } = makeOptions({
      mode: 'task',
      taskHasTime: false,
      startTime: '10:07',
      description: ' ',
      selectedListId: '',
    });

    await useQuickCreateActions(options).handleSubmit();

    expect(options.onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAt: '2026-09-15T16:00:00.000Z',
        hasDueTime: false,
        description: null,
        listId: null,
        priority: 'high',
        isFlexible: true,
        tagIds: [],
      }),
    );
  });

  it.each([
    ['', '10:00'],
    ['bad-date', '10:00'],
    ['2026-09-15', 'bad-time'],
  ])('keeps null task dueAt for date %s and time %s', async (startDate, startTime) => {
    const { options } = makeOptions({ mode: 'task', startDate, startTime });

    await useQuickCreateActions(options).handleSubmit();

    expect(options.onCreateTask).toHaveBeenCalledWith(expect.objectContaining({ dueAt: null }));
  });

  it('passes through task Errors and uses the non-Error fallback without closing', async () => {
    const error = makeOptions({
      mode: 'task',
      onCreateTask: vi.fn(async () => {
        throw new Error('Task failed');
      }),
    }).options;
    await useQuickCreateActions(error).handleSubmit();
    expect(error.setErrorMessage).toHaveBeenLastCalledWith('Task failed');
    expect(error.onClose).not.toHaveBeenCalled();

    const unknown = makeOptions({
      mode: 'task',
      onCreateTask: vi.fn(async () => {
        throw 'unknown';
      }),
    }).options;
    await useQuickCreateActions(unknown).handleSubmit();
    expect(unknown.setErrorMessage).toHaveBeenLastCalledWith('Could not create task.');
    expect(unknown.onClose).not.toHaveBeenCalled();
  });

  it.each([
    { editingOccurrence: null },
    { editingOccurrence, onDeleteEvent: undefined },
    { editingOccurrence, isSaving: true },
  ])('guards delete when its prerequisites are missing', async (override) => {
    const { options } = makeOptions(override);

    await useQuickCreateActions(options).handleDelete();

    expect(options.setIsDeleteConfirmOpen).not.toHaveBeenCalled();
    if (options.onDeleteEvent) expect(options.onDeleteEvent).not.toHaveBeenCalled();
    expect(options.onClose).not.toHaveBeenCalled();
  });

  it('closes delete confirmation before the mutation and closes the popover on success', async () => {
    let resolveDelete: (() => void) | undefined;
    const onDeleteEvent = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const { options } = makeOptions({ editingOccurrence, onDeleteEvent });

    const pending = useQuickCreateActions(options).handleDelete();
    expect(options.setIsDeleteConfirmOpen).toHaveBeenCalledWith(false);
    expect(onDeleteEvent).toHaveBeenCalledWith(event);
    expect(options.onClose).not.toHaveBeenCalled();

    resolveDelete?.();
    await pending;
    expect(options.onClose).toHaveBeenCalledOnce();
  });

  it('leaves delete confirmation closed on Error or non-Error failure', async () => {
    const error = makeOptions({
      editingOccurrence,
      onDeleteEvent: vi.fn(async () => {
        throw new Error('Delete failed');
      }),
    }).options;
    await useQuickCreateActions(error).handleDelete();
    expect(error.setIsDeleteConfirmOpen).toHaveBeenCalledOnce();
    expect(error.setIsDeleteConfirmOpen).toHaveBeenCalledWith(false);
    expect(error.setErrorMessage).toHaveBeenCalledWith('Delete failed');
    expect(error.onClose).not.toHaveBeenCalled();

    const unknown = makeOptions({
      editingOccurrence,
      onDeleteEvent: vi.fn(async () => {
        throw 'unknown';
      }),
    }).options;
    await useQuickCreateActions(unknown).handleDelete();
    expect(unknown.setIsDeleteConfirmOpen).toHaveBeenCalledOnce();
    expect(unknown.setIsDeleteConfirmOpen).toHaveBeenCalledWith(false);
    expect(unknown.setErrorMessage).toHaveBeenCalledWith('Could not delete event.');
    expect(unknown.onClose).not.toHaveBeenCalled();
  });
});
