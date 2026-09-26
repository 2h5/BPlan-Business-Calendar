import { zonedWallClockToUtc } from '@cal/domain';
import type { Calendar, CalendarEvent, CreateTaskInput, TaskPriority } from '@cal/schemas';
import type { FormEvent, RefObject } from 'react';

import type { EventOccurrence } from '../utils/calendar-occurrences';
import { eventInputFromForm, type EventFormValues } from '../utils/event-form';

interface UseQuickCreateActionsOptions {
  mode: 'event' | 'task';
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  calendarId: string;
  selectedListId: string;
  taskPriority: TaskPriority;
  taskHasTime: boolean;
  editingOccurrence?: EventOccurrence | null;
  defaultCalendar: Calendar | undefined;
  timeZone: string;
  isSaving: boolean;
  titleInputRef: RefObject<HTMLInputElement | null>;
  setErrorMessage: (message: string | null) => void;
  setIsDeleteConfirmOpen: (isOpen: boolean) => void;
  onClose: () => void;
  onCreateEvent: (input: ReturnType<typeof eventInputFromForm>) => Promise<void>;
  onUpdateEvent?: (
    event: CalendarEvent,
    input: ReturnType<typeof eventInputFromForm>,
  ) => Promise<void>;
  onDeleteEvent?: (event: CalendarEvent) => Promise<void>;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
}

export function useQuickCreateActions({
  mode,
  title,
  startDate,
  endDate,
  allDay,
  startTime,
  endTime,
  location,
  description,
  calendarId,
  selectedListId,
  taskPriority,
  taskHasTime,
  editingOccurrence,
  defaultCalendar,
  timeZone,
  isSaving,
  titleInputRef,
  setErrorMessage,
  setIsDeleteConfirmOpen,
  onClose,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onCreateTask,
}: UseQuickCreateActionsOptions) {
  const handleDelete = async () => {
    if (!editingOccurrence || !onDeleteEvent || isSaving) return;
    setIsDeleteConfirmOpen(false);
    try {
      await onDeleteEvent(editingOccurrence.event);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not delete event.');
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage(mode === 'event' ? 'Give the event a title' : 'What needs doing?');
      titleInputRef.current?.focus();
      return;
    }

    if (mode === 'event') {
      const activeCalendarId = calendarId || defaultCalendar?.id;
      if (!activeCalendarId) {
        setErrorMessage('Select a writable calendar.');
        return;
      }

      const formValues: EventFormValues = {
        title: trimmedTitle,
        description: description.trim(),
        location: location.trim(),
        calendarId: activeCalendarId,
        startDate,
        startTime,
        endDate,
        endTime,
        allDay,
        recurrenceRule: editingOccurrence?.event.recurrenceRule ?? null,
        alerts: editingOccurrence ? [...editingOccurrence.event.alerts] : [],
      };

      try {
        const input = eventInputFromForm(formValues, timeZone);
        if (editingOccurrence && onUpdateEvent) {
          await onUpdateEvent(editingOccurrence.event, input);
        } else {
          await onCreateEvent(input);
        }
        onClose();
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : editingOccurrence
              ? 'Could not update event.'
              : 'Could not create event.',
        );
      }
    } else {
      // Task creation
      try {
        let dueAt: string | null = null;
        if (startDate) {
          const [year, month, day] = startDate.split('-').map(Number);
          const [hour, minute] = (taskHasTime ? startTime : '12:00').split(':').map(Number);
          if (
            typeof year === 'number' &&
            !Number.isNaN(year) &&
            typeof month === 'number' &&
            !Number.isNaN(month) &&
            typeof day === 'number' &&
            !Number.isNaN(day) &&
            typeof hour === 'number' &&
            !Number.isNaN(hour) &&
            typeof minute === 'number' &&
            !Number.isNaN(minute)
          ) {
            const dueInstant = zonedWallClockToUtc({ year, month, day, hour, minute }, timeZone);
            dueAt = dueInstant.toISOString();
          }
        }

        await onCreateTask({
          title: trimmedTitle,
          description: description.trim() || null,
          listId: selectedListId || null,
          priority: taskPriority,
          dueAt,
          hasDueTime: taskHasTime,
          isFlexible: true,
          tagIds: [],
        });
        onClose();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Could not create task.');
      }
    }
  };

  return { handleSubmit, handleDelete };
}
