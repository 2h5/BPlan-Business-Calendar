import type { Calendar, CalendarEvent, CreateTaskInput } from '@cal/schemas';
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import { QuickCreateEventFields } from './components/QuickCreateEventFields';
import { QuickCreateHeader } from './components/QuickCreateHeader';
import { QuickCreateTaskFields } from './components/QuickCreateTaskFields';
import { useQuickCreateActions } from './hooks/useQuickCreateActions';
import { useQuickCreateDraft } from './hooks/useQuickCreateDraft';
import { useQuickCreateLifecycle } from './hooks/useQuickCreateLifecycle';
import { useQuickCreatePosition } from './hooks/useQuickCreatePosition';
import styles from './QuickCreatePopover.module.css';
import { useTaskLists } from '../../tasks/hooks/useTasks';
import type { EventOccurrence } from '../utils/calendar-occurrences';
import type { eventInputFromForm, EventFormValues } from '../utils/event-form';
import type { AnchorRect } from '../utils/popover-position';
import {
  addMinutesToTime,
  createEndTimePickerOptions,
  createTimeOptions,
  formatDateDisplay,
  withCustomTimeOption,
} from './utils/quick-create-time';

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
  const { data: taskLists } = useTaskLists();
  const writableCals = useMemo(() => calendars.filter((cal) => !cal.isReadOnly), [calendars]);

  const defaultCalendar = useMemo(
    () => writableCals.find((c) => c.isDefault) ?? writableCals[0],
    [writableCals],
  );

  const {
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
  } = useQuickCreateDraft({
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
  });

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

  const timeOptions = useMemo(createTimeOptions, []);

  const startTimeOptions = useMemo(
    () => withCustomTimeOption(timeOptions, startTime),
    [startTime, timeOptions],
  );

  const endTimeOptions = useMemo(
    () => withCustomTimeOption(timeOptions, endTime),
    [endTime, timeOptions],
  );

  const endTimePickerOptions = useMemo(
    () => createEndTimePickerOptions(startTime, endTime, endTimeOptions),
    [endTime, endTimeOptions, startTime],
  );

  const { handleSubmit, handleDelete } = useQuickCreateActions({
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
  });

  const { isClosing, handleRequestClose, handleAnimationEnd } = useQuickCreateLifecycle({
    isOpen,
    isSaving,
    isDeleteConfirmOpen,
    setIsDeleteConfirmOpen,
    popoverRef,
    titleInputRef,
    onClosing,
    onClose,
  });

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

        <QuickCreateHeader
          isEditing={!!editingOccurrence}
          mode={mode}
          isSaving={isSaving}
          showDelete={!!editingOccurrence && !!onDeleteEvent && !isReadOnly}
          isDeleteConfirmOpen={isDeleteConfirmOpen}
          onSelectEvent={() => {
            setMode('event');
            setErrorMessage(null);
          }}
          onSelectTask={() => {
            setMode('task');
            setErrorMessage(null);
          }}
          onToggleDeleteConfirm={() => setIsDeleteConfirmOpen((current) => !current)}
          onCancelDelete={() => setIsDeleteConfirmOpen(false)}
          onConfirmDelete={() => void handleDelete()}
          onRequestClose={handleRequestClose}
        />

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
