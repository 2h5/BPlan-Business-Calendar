import { toZonedDateKey } from '@cal/domain';
import type { Calendar } from '@cal/schemas';
import { useCallback, useMemo, useRef, useState } from 'react';

import { CalendarEditor } from './CalendarEditor';
import { CalendarSidebar } from './CalendarSidebar';
import { CalendarToolbar } from './CalendarToolbar';
import styles from './CalendarView.module.css';
import { EventEditor } from './EventEditor';
import { MonthView } from './MonthView';
import { TimelineView } from './TimelineView';
import {
  useCreateCalendar,
  useCreateEvent,
  useDeleteCalendar,
  useDeleteEvent,
  useToggleCalendarVisibility,
  useUpdateCalendar,
  useUpdateEvent,
} from '../hooks/useCalendarMutations';
import { type EventOccurrence, useCalendarWindow } from '../hooks/useCalendarWindow';
import { type CalendarViewMode, formatRangeHeading, shiftDateKey } from '../utils/calendar-window';

function CalendarState({
  kind,
  onRetry,
}: {
  kind: 'loading' | 'empty' | 'error';
  onRetry?: () => void;
}) {
  const copy = {
    loading: ['Loading your calendar', 'Bringing your calendars and events into view.'],
    empty: [
      'Nothing scheduled here',
      'This range is clear. Events from visible calendars will appear here.',
    ],
    error: ['We could not load your calendar', 'Check the local connection and try again.'],
  }[kind];

  return (
    <div className={styles.statePanel} role={kind === 'error' ? 'alert' : 'status'}>
      <svg
        viewBox="0 0 24 24"
        width="36"
        height="36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        {kind === 'error' ? <path d="M12 14v3M12 19h.01" /> : null}
      </svg>
      <strong>{copy[0]}</strong>
      <span>{copy[1]}</span>
      {kind === 'error' && onRetry ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function CalendarView() {
  const initialTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [mode, setMode] = useState<CalendarViewMode>('week');
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    toZonedDateKey(new Date(), initialTimeZone),
  );
  const [selectedOccurrence, setSelectedOccurrence] = useState<EventOccurrence | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [calendarEditorOpen, setCalendarEditorOpen] = useState(false);
  const [editingCalendar, setEditingCalendar] = useState<Calendar | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const openingControlRef = useRef<HTMLElement | null>(null);

  const result = useCalendarWindow(mode, selectedDateKey);
  const toggleVisibility = useToggleCalendarVisibility();
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();
  const removeCalendar = useDeleteCalendar();
  const createEvent = useCreateEvent(result.calendars);
  const updateEvent = useUpdateEvent(result.calendars);
  const removeEvent = useDeleteEvent(result.calendars);
  const { window, timeZone } = result;
  const heading = useMemo(
    () => formatRangeHeading(mode, selectedDateKey, window, timeZone),
    [mode, selectedDateKey, timeZone, window],
  );

  const handleToggleVisibility = useCallback(
    (calendar: Calendar) => {
      toggleVisibility.mutate(
        { id: calendar.id, isVisible: !calendar.isVisible },
        {
          onError: (error) =>
            setToast(error instanceof Error ? error.message : 'Visibility could not be saved.'),
        },
      );
      if (selectedOccurrence?.event.calendarId === calendar.id) setSelectedOccurrence(null);
    },
    [selectedOccurrence, toggleVisibility],
  );

  const changeMode = useCallback((nextMode: CalendarViewMode) => {
    setMode(nextMode);
    setSelectedOccurrence(null);
    setIsDraft(false);
  }, []);

  const selectMonthDate = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
    setMode('day');
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDateKey(toZonedDateKey(new Date(), timeZone));
  }, [timeZone]);

  const closeEventEditor = useCallback(() => {
    setSelectedOccurrence(null);
    setIsDraft(false);
    globalThis.requestAnimationFrame(() => openingControlRef.current?.focus());
  }, []);

  const rememberOpeningControl = useCallback(() => {
    openingControlRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const closeCalendarEditor = useCallback(() => {
    setCalendarEditorOpen(false);
    globalThis.requestAnimationFrame(() => openingControlRef.current?.focus());
  }, []);

  const showSuccess = useCallback((message: string) => {
    setToast(message);
    globalThis.setTimeout(() => setToast(null), 3000);
  }, []);

  return (
    <div className={styles.workspace}>
      <CalendarSidebar
        calendars={result.calendars}
        timeZone={timeZone}
        onToggleVisibility={handleToggleVisibility}
        onCreateCalendar={() => {
          rememberOpeningControl();
          setEditingCalendar(null);
          setCalendarEditorOpen(true);
        }}
        onEditCalendar={(calendar) => {
          rememberOpeningControl();
          setEditingCalendar(calendar);
          setCalendarEditorOpen(true);
        }}
      />

      <section className={styles.calendarMain} aria-label="Calendar">
        <CalendarToolbar
          mode={mode}
          heading={heading}
          isFetching={result.isFetching && !result.isLoading}
          onModeChange={changeMode}
          onPrevious={() => setSelectedDateKey(shiftDateKey(selectedDateKey, mode, -1, timeZone))}
          onToday={goToToday}
          onNext={() => setSelectedDateKey(shiftDateKey(selectedDateKey, mode, 1, timeZone))}
          onCreateEvent={() => {
            if (!result.calendars.some((calendar) => !calendar.isReadOnly)) {
              setToast('Create or connect a writable calendar first.');
              return;
            }
            rememberOpeningControl();
            setSelectedOccurrence(null);
            setIsDraft(true);
          }}
        />

        <div className={styles.calendarSurface}>
          {result.isLoading ? (
            <CalendarState kind="loading" />
          ) : result.isError ? (
            <CalendarState kind="error" onRetry={result.refetch} />
          ) : mode === 'month' ? (
            <MonthView
              dateKeys={window.dateKeys}
              byDateKey={result.byDateKey}
              selectedDateKey={selectedDateKey}
              timeZone={timeZone}
              now={new Date()}
              onSelectDate={selectMonthDate}
              onSelectEvent={(occurrence) => {
                rememberOpeningControl();
                setIsDraft(false);
                setSelectedOccurrence(occurrence);
              }}
            />
          ) : (
            <TimelineView
              dateKeys={window.dateKeys}
              byDateKey={result.byDateKey}
              selectedDateKey={selectedDateKey}
              timeZone={timeZone}
              hourCycle={result.hourCycle}
              now={new Date()}
              onSelectDate={setSelectedDateKey}
              onSelectEvent={(occurrence) => {
                rememberOpeningControl();
                setIsDraft(false);
                setSelectedOccurrence(occurrence);
              }}
            />
          )}

          {!result.isLoading && !result.isError && result.occurrences.length === 0 ? (
            <div className={styles.emptyOverlay}>
              <CalendarState kind="empty" />
            </div>
          ) : null}
        </div>
      </section>

      {selectedOccurrence || isDraft ? (
        <>
          <button
            type="button"
            className={styles.detailsBackdrop}
            onClick={closeEventEditor}
            aria-label="Close event editor"
          />
          <EventEditor
            occurrence={selectedOccurrence}
            isDraft={isDraft}
            selectedDateKey={selectedDateKey}
            calendars={result.calendars}
            timeZone={timeZone}
            defaultDurationMinutes={result.defaultEventMinutes}
            isSaving={createEvent.isPending || updateEvent.isPending || removeEvent.isPending}
            onClose={closeEventEditor}
            onCreate={async (input) => {
              await createEvent.mutateAsync(input);
              closeEventEditor();
              showSuccess('Event created.');
            }}
            onUpdate={async (event, input) => {
              await updateEvent.mutateAsync({ event, input });
              closeEventEditor();
              showSuccess('Event updated.');
            }}
            onDelete={async (event) => {
              await removeEvent.mutateAsync(event);
              showSuccess('Event deleted.');
            }}
          />
        </>
      ) : null}

      {calendarEditorOpen ? (
        <CalendarEditor
          calendar={editingCalendar}
          onClose={closeCalendarEditor}
          onCreate={async (input) => {
            await createCalendar.mutateAsync(input);
            showSuccess('Calendar created.');
          }}
          onUpdate={async (calendar, input) => {
            await updateCalendar.mutateAsync({ calendar, input });
            showSuccess('Calendar updated.');
          }}
          onDelete={async (calendar) => {
            await removeCalendar.mutateAsync(calendar);
            showSuccess('Calendar deleted.');
          }}
        />
      ) : null}

      {toast ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
