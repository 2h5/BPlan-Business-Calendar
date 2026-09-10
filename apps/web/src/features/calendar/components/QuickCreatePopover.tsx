import { getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { Calendar, CalendarEvent, CreateTaskInput, TaskPriority } from '@cal/schemas';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './QuickCreatePopover.module.css';
import { Select } from '../../../components/forms/Select';
import { useTaskLists } from '../../tasks/hooks/useTasks';
import type { EventOccurrence } from '../utils/calendar-occurrences';
import { eventInputFromForm, eventToFormValues, type EventFormValues } from '../utils/event-form';
import {
  calculatePopoverPosition,
  type AnchorRect,
  type PopoverPlacement,
} from '../utils/popover-position';

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

  const [coords, setCoords] = useState<{
    style: React.CSSProperties;
    placement: PopoverPlacement;
    arrowTop: number | null;
  }>({
    style: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    placement: 'center',
    arrowTop: null,
  });

  const updatePosition = useCallback(() => {
    if (!isOpen) return;

    const popoverWidth = popoverRef.current ? popoverRef.current.offsetWidth : 380;
    const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 440;

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      gap: 8,
    });

    if (result.placement === 'bottom') {
      setCoords({
        style: {},
        placement: 'bottom',
        arrowTop: null,
      });
      return;
    }

    setCoords({
      style: {
        top: `${result.top}px`,
        left: `${result.left}px`,
      },
      placement: result.placement,
      arrowTop: result.arrowTop,
    });
  }, [anchorRect, isOpen]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, mode, errorMessage]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const [isClosing, setIsClosing] = useState(false);

  const handleRequestClose = useCallback(() => {
    if (isSaving || isClosing) return;
    setIsClosing(true);
  }, [isSaving, isClosing]);

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
  }, [isOpen, isSaving, handleRequestClose]);

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
              <button
                type="button"
                className={styles.deleteButton}
                onClick={handleDelete}
                aria-label="Delete event"
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
            <>
              {/* Event Date & Time */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>

                <div className={styles.timeRangeGroup}>
                  <div className={styles.timeInputs}>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (endDate < e.target.value) setEndDate(e.target.value);
                      }}
                      aria-label="Start date"
                    />

                    {!allDay ? (
                      <>
                        <input
                          type="time"
                          className={styles.timeInput}
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          aria-label="Start time"
                        />
                        <span className={styles.timeSeparator}>–</span>
                        <input
                          type="time"
                          className={styles.timeInput}
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          aria-label="End time"
                        />
                      </>
                    ) : null}

                    <label className={styles.allDayCheckbox}>
                      <input
                        type="checkbox"
                        checked={allDay}
                        onChange={(e) => setAllDay(e.target.checked)}
                      />
                      <span>All day</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Calendar Selector */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>

                <div className={styles.calendarPickerWrapper}>
                  <span
                    className={styles.calendarColorDot}
                    style={{
                      backgroundColor: selectedCalendar?.color ?? 'var(--color-accent)',
                    }}
                    aria-hidden="true"
                  />
                  <div className={styles.calendarSelect}>
                    <Select
                      id="quick-create-calendar"
                      value={calendarId || defaultCalendar?.id || ''}
                      options={writableCals.map((cal) => ({
                        value: cal.id,
                        label: cal.name,
                      }))}
                      onChange={(val) => setCalendarId(val)}
                      size="sm"
                      ariaLabel="Choose calendar"
                    />
                  </div>
                </div>
              </div>

              {/* Location (always opened by default) */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <input
                  type="text"
                  className={styles.textInput}
                  placeholder="Add location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  aria-label="Location"
                />
              </div>

              {/* Description (always opened by default) */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="15" y2="18" />
                  </svg>
                </span>
                <textarea
                  className={styles.textareaInput}
                  placeholder="Add description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-label="Description"
                />
              </div>
            </>
          ) : (
            <>
              {/* Task Mode Details */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>

                <div className={styles.timeRangeGroup}>
                  <div className={styles.timeInputs}>
                    <input
                      type="date"
                      className={styles.dateInput}
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      aria-label="Due date"
                    />

                    {taskHasTime ? (
                      <input
                        type="time"
                        className={styles.timeInput}
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        aria-label="Due time"
                      />
                    ) : null}

                    <label className={styles.allDayCheckbox}>
                      <input
                        type="checkbox"
                        checked={taskHasTime}
                        onChange={(e) => setTaskHasTime(e.target.checked)}
                      />
                      <span>Set time</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Task List Selector */}
              {taskLists && taskLists.length > 0 && (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldIcon} aria-hidden="true">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                  </span>

                  <div className={styles.calendarSelect}>
                    <Select
                      id="quick-create-task-list"
                      value={selectedListId || taskLists[0]?.id || ''}
                      options={taskLists.map((list) => ({
                        value: list.id,
                        label: list.name,
                      }))}
                      onChange={(val) => setSelectedListId(val)}
                      size="sm"
                      ariaLabel="Choose task list"
                    />
                  </div>
                </div>
              )}

              {/* Priority */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                </span>

                <div className={styles.priorityGroup} role="group" aria-label="Task priority">
                  {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`${styles.priorityButton} ${taskPriority === p ? styles.priorityButtonActive : ''}`}
                      onClick={() => setTaskPriority(p)}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Task Description (always opened by default) */}
              <div className={styles.fieldRow}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="15" y2="18" />
                  </svg>
                </span>
                <textarea
                  className={styles.textareaInput}
                  placeholder="Add description"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-label="Description"
                />
              </div>
            </>
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
