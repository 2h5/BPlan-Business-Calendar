import { getZonedParts } from '@cal/domain';
import type { Calendar, TaskList, TaskPriority } from '@cal/schemas';
import { useEffect, useMemo, useState } from 'react';

import type { EventOccurrence } from '../utils/calendar-occurrences';
import { eventToFormValues } from '../utils/event-form';
import { addMinutesToTime, pad } from '../utils/quick-create-time';

interface UseQuickCreateDraftOptions {
  isOpen: boolean;
  editingOccurrence?: EventOccurrence | null;
  selectedDateKey: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialAllDay: boolean;
  timeZone: string;
  defaultDurationMinutes: number;
  defaultCalendar: Calendar | undefined;
  taskLists: TaskList[] | undefined;
}

export function useQuickCreateDraft({
  isOpen,
  editingOccurrence,
  selectedDateKey,
  initialStartTime,
  initialEndTime,
  initialAllDay,
  timeZone,
  defaultDurationMinutes,
  defaultCalendar,
  taskLists,
}: UseQuickCreateDraftOptions) {
  const initialFormValues = useMemo(
    () => (editingOccurrence ? eventToFormValues(editingOccurrence.event) : null),
    [editingOccurrence],
  );

  const [mode, setMode] = useState<'event' | 'task'>('event');
  const [title, setTitle] = useState(() => initialFormValues?.title ?? '');
  const [startDate, setStartDate] = useState(() => initialFormValues?.startDate ?? selectedDateKey);
  const [endDate, setEndDate] = useState(() => initialFormValues?.endDate ?? selectedDateKey);
  const [allDay, setAllDay] = useState(() => initialFormValues?.allDay ?? initialAllDay);
  const [startTime, setStartTime] = useState(() => {
    if (initialFormValues?.startTime) return initialFormValues.startTime;
    if (initialStartTime) return initialStartTime;
    const nowParts = getZonedParts(new Date(), timeZone);
    const defaultHour = Math.min(23, nowParts.hour + 1);
    return `${pad(defaultHour)}:00`;
  });
  const [endTime, setEndTime] = useState(() => {
    if (initialFormValues?.endTime) return initialFormValues.endTime;
    if (initialEndTime) return initialEndTime;
    const base =
      initialStartTime || `${pad(Math.min(23, getZonedParts(new Date(), timeZone).hour + 1))}:00`;
    return addMinutesToTime(base, defaultDurationMinutes);
  });
  const [location, setLocation] = useState(() => initialFormValues?.location ?? '');
  const [description, setDescription] = useState(() => initialFormValues?.description ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Task specific state
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('normal');
  const [taskHasTime, setTaskHasTime] = useState(!initialAllDay);

  const [calendarId, setCalendarId] = useState<string>(
    () =>
      initialFormValues?.calendarId ??
      editingOccurrence?.event.calendarId ??
      defaultCalendar?.id ??
      '',
  );

  // Sync state whenever opening with new initial coordinates, slot, or event
  useEffect(() => {
    if (isOpen) {
      if (editingOccurrence) {
        setMode('event');
        const formVals = eventToFormValues(editingOccurrence.event);
        setTitle(formVals.title);
        setCalendarId(formVals.calendarId);
        setStartDate(formVals.startDate);
        setEndDate(formVals.endDate);
        setStartTime(formVals.startTime);
        setEndTime(formVals.endTime);
        setAllDay(formVals.allDay);
        setLocation(formVals.location);
        setDescription(formVals.description);
      } else {
        setTitle('');
        setLocation('');
        setDescription('');
        setStartDate(selectedDateKey);
        setEndDate(selectedDateKey);
        setAllDay(initialAllDay);
        if (initialStartTime) {
          setStartTime(initialStartTime);
          setEndTime(initialEndTime ?? addMinutesToTime(initialStartTime, defaultDurationMinutes));
        }
        if (defaultCalendar && !calendarId) {
          setCalendarId(defaultCalendar.id);
        }
      }
      setErrorMessage(null);
      setIsDeleteConfirmOpen(false);
      if (taskLists && taskLists.length > 0 && !selectedListId && taskLists[0]) {
        setSelectedListId(taskLists[0].id);
      }
    }
  }, [
    isOpen,
    editingOccurrence,
    selectedDateKey,
    initialStartTime,
    initialEndTime,
    initialAllDay,
    defaultDurationMinutes,
    defaultCalendar,
    calendarId,
    taskLists,
    selectedListId,
  ]);

  return {
    mode,
    setMode,
    title,
    setTitle,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    allDay,
    setAllDay,
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    location,
    setLocation,
    description,
    setDescription,
    calendarId,
    setCalendarId,
    selectedListId,
    setSelectedListId,
    taskPriority,
    setTaskPriority,
    taskHasTime,
    setTaskHasTime,
    errorMessage,
    setErrorMessage,
    isDeleteConfirmOpen,
    setIsDeleteConfirmOpen,
  };
}
