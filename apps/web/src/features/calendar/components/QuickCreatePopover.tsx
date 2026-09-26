import { getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { Calendar, CalendarEvent, CreateTaskInput, TaskPriority } from '@cal/schemas';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { QuickCreateEventFields } from './QuickCreateEventFields';
import { formatDurationBetweenTimes, type TimePickerOption } from './QuickCreatePickers';
import styles from './QuickCreatePopover.module.css';
import { QuickCreateTaskFields } from './QuickCreateTaskFields';
import { useTaskLists } from '../../tasks/hooks/useTasks';
import { useQuickCreatePosition } from '../hooks/useQuickCreatePosition';
import type { EventOccurrence } from '../utils/calendar-occurrences';
import { eventInputFromForm, eventToFormValues, type EventFormValues } from '../utils/event-form';
import type { AnchorRect } from '../utils/popover-position';

export type { AnchorRect };

export interface QuickCreatePopoverProps {
  isOpen: boolean;
  anchorRect: AnchorRect | null;
  selectedDateKey: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialAllDay?: boolean;
  editingOccurrence?: EventOccurrence | null;
  calendars: readonly Calendar[];
  timeZone: string;
  defaultDurationMinutes: number;
  isSaving: boolean;
  onClose: () => void;
  onClosing?: () => void;
  onCreateEvent: (input: ReturnType<typeof eventInputFromForm>) => Promise<void>;
  onUpdateEvent?: (
    event: CalendarEvent,
    input: ReturnType<typeof eventInputFromForm>,
  ) => Promise<void>;
  onDeleteEvent?: (event: CalendarEvent) => Promise<void>;
  onCreateTask: (input: CreateTaskInput) => Promise<void>;
  onMoreOptions: (draftValues: Partial<EventFormValues>) => void;
  onDraftChange?: (draft: { title: string; calendarColor: string }) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h ?? 9) * 60 + (m ?? 0) + minutes;
  const newHour = Math.floor(total / 60) % 24;
  const newMin = total % 60;
  return `${pad(newHour)}:${pad(newMin)}`;
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeDisplay(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')}${period}`;
}

export function QuickCreatePopover({
  isOpen,
  anchorRect,
  selectedDateKey,
  initialStartTime,
  initialEndTime,
  initialAllDay = false,
  editingOccurrence,
  calendars,
  timeZone,
  defaultDurationMinutes,
  isSaving,
  onClose,
  onClosing,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onCreateTask,
  onMoreOptions,
  onDraftChange,
}: QuickCreatePopoverProps) {
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
  const { data: taskLists } = useTaskLists();
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('normal');
  const [taskHasTime, setTaskHasTime] = useState(!initialAllDay);

  const writableCals = useMemo(() => calendars.filter((cal) => !cal.isReadOnly), [calendars]);

  const defaultCalendar = useMemo(
    () => writableCals.find((c) => c.isDefault) ?? writableCals[0],
    [writableCals],
  );

  const [calendarId, setCalendarId] = useState<string>(
    () =>
      initialFormValues?.calendarId ??
      editingOccurrence?.event.calendarId ??
      defaultCalendar?.id ??
      '',
  );

  const isReadOnly = useMemo(() => {
    if (!editingOccurrence) return false;
    const cal = calendars.find((c) => c.id === (calendarId || editingOccurrence.event.calendarId));
    return !!cal?.isReadOnly;
  }, [calendars, calendarId, editingOccurrence]);

  const selectedCalendar = useMemo(
    () => calendars.find((c) => c.id === calendarId) ?? defaultCalendar,
    [calendars, calendarId, defaultCalendar],
  );

  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = (sh ?? 0) * 60 + (sm ?? 0);
    const endMin = (eh ?? 0) * 60 + (em ?? 0);
    const diff = endMin - startMin;
    const duration = diff > 0 ? diff : defaultDurationMinutes;
    setEndTime(addMinutesToTime(newStartTime, duration));
  };

  const timeOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const val = `${pad(h)}:${pad(m)}`;
        options.push({
          value: val,
          label: formatTimeDisplay(val),
        });
      }
    }
    return options;
  }, []);

  const startTimeOptions = useMemo(() => {
    if (startTime && !timeOptions.some((o) => o.value === startTime)) {
      const custom = { value: startTime, label: formatTimeDisplay(startTime) };
      return [...timeOptions, custom].sort((a, b) => a.value.localeCompare(b.value));
    }
    return timeOptions;
  }, [startTime, timeOptions]);

  const endTimeOptions = useMemo(() => {
    if (endTime && !timeOptions.some((o) => o.value === endTime)) {
      const custom = { value: endTime, label: formatTimeDisplay(endTime) };
      return [...timeOptions, custom].sort((a, b) => a.value.localeCompare(b.value));
    }
    return timeOptions;
  }, [endTime, timeOptions]);

  const endTimePickerOptions = useMemo<TimePickerOption[]>(
    () =>
      endTimeOptions
        .map((option) => ({
          ...option,
          detail: formatDurationBetweenTimes(startTime, option.value),
        }))
        .filter((option) => option.detail || option.value === endTime),
    [endTime, endTimeOptions, startTime],
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

  // Autofocus title input when popover opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        titleInputRef.current?.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Notify parent of draft updates for calendar preview
  useEffect(() => {
    if (isOpen && onDraftChange) {
      onDraftChange({
        title,
        calendarColor: selectedCalendar?.color ?? 'var(--color-accent)',
      });
    }
  }, [isOpen, title, selectedCalendar, onDraftChange]);

  const coords = useQuickCreatePosition({
    isOpen,
    anchorRect,
    editingOccurrence,
    popoverRef,
    mode,
    errorMessage,
  });

  const [isClosing, setIsClosing] = useState(false);

  const handleRequestClose = useCallback(() => {
    if (isSaving || isClosing) return;
    setIsClosing(true);
    onClosing?.();
  }, [isSaving, isClosing, onClosing]);

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (isClosing && e.target === popoverRef.current) {
      setIsClosing(false);
      onClose();
    }
  };

  // Keyboard navigation & Escape key & focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        e.stopPropagation();
        if (isDeleteConfirmOpen) {
          e.preventDefault();
          setIsDeleteConfirmOpen(false);
          return;
        }
        handleRequestClose();
      }

      if (e.key === 'Tab' && popoverRef.current) {
        const focusable = popoverRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isDeleteConfirmOpen, isOpen, isSaving, handleRequestClose]);

  if (!isOpen) return null;

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMoreOptions = () => {
    onMoreOptions({
      title: title.trim(),
      calendarId: calendarId || defaultCalendar?.id || '',
      startDate,
      startTime,
      endDate,
      endTime,
      allDay,
      location: location.trim(),
      description: description.trim(),
      recurrenceRule: editingOccurrence?.event.recurrenceRule ?? null,
      alerts: editingOccurrence ? [...editingOccurrence.event.alerts] : [],
    });
    onClose();
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

  const content = (
    <>
      <div
        className={`${styles.backdrop} ${isClosing ? styles.backdropClosing : ''}`}
        onClick={() => {
          if (!isSaving) handleRequestClose();
        }}
        aria-hidden="true"
      />

      <div
        ref={popoverRef}
        className={`${styles.popover} ${isClosing ? styles.popoverClosing : ''}`}
        style={coords.style}
        role="dialog"
        aria-modal="true"
        aria-label={editingOccurrence ? 'Edit event' : 'Quick create event or task'}
        onAnimationEnd={handleAnimationEnd}
      >
        <div className={styles.sheetHandle} aria-hidden="true" />

        {coords.arrowTop !== null && coords.placement === 'right' && (
          <div
            className={`${styles.arrow} ${styles.arrowLeft}`}
            style={{ top: `${coords.arrowTop}px` }}
            aria-hidden="true"
          />
        )}
        {coords.arrowTop !== null && coords.placement === 'left' && (
          <div
            className={`${styles.arrow} ${styles.arrowRight}`}
            style={{ top: `${coords.arrowTop}px` }}
            aria-hidden="true"
          />
        )}
        {coords.arrowLeft !== null && coords.placement === 'below' && (
          <div
            className={`${styles.arrow} ${styles.arrowTop}`}
            style={{ left: `${coords.arrowLeft}px` }}
            aria-hidden="true"
          />
        )}
        {coords.arrowLeft !== null && coords.placement === 'above' && (
          <div
            className={`${styles.arrow} ${styles.arrowBottom}`}
            style={{ left: `${coords.arrowLeft}px` }}
            aria-hidden="true"
          />
        )}

        <header className={styles.header}>
          {editingOccurrence ? (
            <span className={styles.editingLabel}>Edit event</span>
          ) : (
            <div className={styles.typeTabs} role="tablist" aria-label="Creation type">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'event'}
                className={`${styles.tabButton} ${mode === 'event' ? styles.tabButtonActive : ''}`}
                onClick={() => {
                  setMode('event');
                  setErrorMessage(null);
                }}
              >
                Event
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'task'}
                className={`${styles.tabButton} ${mode === 'task' ? styles.tabButtonActive : ''}`}
                onClick={() => {
                  setMode('task');
                  setErrorMessage(null);
                }}
              >
                Task
              </button>
            </div>
          )}

          <div className={styles.headerRight}>
            {editingOccurrence && onDeleteEvent && !isReadOnly && (
              <div className={styles.deleteControl}>
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => setIsDeleteConfirmOpen((current) => !current)}
                  aria-label="Delete event"
                  aria-expanded={isDeleteConfirmOpen}
                  aria-controls="quick-create-delete-confirm"
                  title="Delete event"
                  disabled={isSaving}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>

                {isDeleteConfirmOpen ? (
                  <div
                    id="quick-create-delete-confirm"
                    className={styles.deleteConfirm}
                    role="alertdialog"
                    aria-label="Confirm event deletion"
                  >
                    <span>Delete this event?</span>
                    <div className={styles.deleteConfirmActions}>
                      <button
                        type="button"
                        className={styles.deleteCancelButton}
                        onClick={() => setIsDeleteConfirmOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.deleteConfirmButton}
                        onClick={() => void handleDelete()}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <button
              type="button"
              className={styles.closeButton}
              onClick={handleRequestClose}
              aria-label="Close"
              disabled={isSaving}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.titleRow}>
            <span className={styles.fieldIconPlaceholder} aria-hidden="true" />
            <div className={styles.titleInputWrapper}>
              <input
                ref={titleInputRef}
                type="text"
                className={styles.titleInput}
                placeholder={mode === 'event' ? 'Add title' : 'What needs doing?'}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                disabled={isSaving}
                aria-label="Title"
                required
              />
            </div>
          </div>

          {errorMessage && (
            <div className={styles.errorBanner} role="alert">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {mode === 'event' ? (
            <QuickCreateEventFields
              startDate={startDate}
              startDateDisplay={formatDateDisplay(startDate)}
              onStartDateChange={(value) => {
                setStartDate(value);
                if (endDate < value) setEndDate(value);
              }}
              startTime={startTime}
              startTimeOptions={startTimeOptions}
              onStartTimeChange={handleStartTimeChange}
              endTime={endTime}
              endTimePickerOptions={endTimePickerOptions}
              onEndTimeChange={setEndTime}
              allDay={allDay}
              onAllDayChange={setAllDay}
              writableCalendars={writableCals}
              selectedCalendarColor={selectedCalendar?.color}
              calendarId={calendarId}
              defaultCalendarId={defaultCalendar?.id ?? ''}
              onCalendarChange={setCalendarId}
              location={location}
              onLocationChange={setLocation}
              description={description}
              onDescriptionChange={setDescription}
            />
          ) : (
            <QuickCreateTaskFields
              startDate={startDate}
              startDateDisplay={formatDateDisplay(startDate)}
              onStartDateChange={setStartDate}
              startTime={startTime}
              startTimeOptions={startTimeOptions}
              onStartTimeChange={setStartTime}
              taskHasTime={taskHasTime}
              onTaskHasTimeChange={setTaskHasTime}
              taskLists={taskLists}
              selectedListId={selectedListId}
              onSelectedListChange={setSelectedListId}
              taskPriority={taskPriority}
              onTaskPriorityChange={setTaskPriority}
              description={description}
              onDescriptionChange={setDescription}
            />
          )}
        </form>

        <footer className={styles.footer}>
          {mode === 'event' ? (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={handleMoreOptions}
              disabled={isSaving}
            >
              More options
            </button>
          ) : (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </button>
          )}

          <div className={styles.footerRight}>
            <button
              type="button"
              className={styles.saveButton}
              onClick={() => handleSubmit()}
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }

  return content;
}
