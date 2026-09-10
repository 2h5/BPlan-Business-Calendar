import { toZonedDateKey } from '@cal/domain';
import type { Calendar } from '@cal/schemas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CalendarEditor } from './CalendarEditor';
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
import { getDefaultCalendarView, isValidCalendarViewMode } from '../utils/calendar-preferences';
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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [mode, setMode] = useState<CalendarViewMode>(() => {
    const viewParam = searchParams.get('view');
    if (isValidCalendarViewMode(viewParam)) return viewParam;
    return getDefaultCalendarView();
  });
  const [transitionDirection, setTransitionDirection] = useState<'in' | 'out' | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState(
    () => searchParams.get('date') ?? toZonedDateKey(new Date(), initialTimeZone),
  );
  const [requestedEventId, setRequestedEventId] = useState<string | null>(() =>
    searchParams.get('event'),
  );
  const [selectedOccurrence, setSelectedOccurrence] = useState<EventOccurrence | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [isEventEditorClosing, setIsEventEditorClosing] = useState(false);
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

  const dateParam = searchParams.get('date');
  useEffect(() => {
    if (dateParam) {
      setSelectedDateKey(dateParam);
    }
  }, [dateParam]);

  const hasRequestedNewEvent =
    searchParams.get('new') === 'true' || searchParams.get('newEvent') === 'true';

  useEffect(() => {
    if (!hasRequestedNewEvent) return;
    if (result.isLoading) return;

    if (result.calendars.some((calendar) => !calendar.isReadOnly)) {
      setIsEventEditorClosing(false);
      setSelectedOccurrence(null);
      setIsDraft(true);
    } else {
      setToast('Create or connect a writable calendar first.');
    }
  }, [hasRequestedNewEvent, result.isLoading, result.calendars]);

  useEffect(() => {
    if (!requestedEventId) return;
    const occurrence = result.occurrences.find((item) => item.event.id === requestedEventId);
    if (occurrence) {
      setIsEventEditorClosing(false);
      setSelectedOccurrence(occurrence);
      setRequestedEventId(null);
    }
  }, [requestedEventId, result.occurrences]);
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

  const changeMode = useCallback(
    (nextMode: CalendarViewMode) => {
      if (nextMode === mode) return;
      const order: Record<CalendarViewMode, number> = { day: 0, week: 1, month: 2 };
      const dir = order[nextMode] < order[mode] ? 'in' : 'out';
      setTransitionDirection(dir);
      setMode(nextMode);
      setSelectedOccurrence(null);
      setIsDraft(false);
      setIsEventEditorClosing(false);
    },
    [mode],
  );

  const selectMonthDate = useCallback(
    (dateKey: string) => {
      setSelectedDateKey(dateKey);
      changeMode('day');
    },
    [changeMode],
  );

  const goToToday = useCallback(() => {
    setSelectedDateKey(toZonedDateKey(new Date(), timeZone));
  }, [timeZone]);

  const closeEventEditor = useCallback(() => {
    setIsEventEditorClosing(true);
  }, []);

  const handleEventEditorCloseAnimationEnd = useCallback(() => {
    setSelectedOccurrence(null);
    setIsDraft(false);
    setIsEventEditorClosing(false);
    globalThis.requestAnimationFrame(() => openingControlRef.current?.focus());

    if (searchParams.has('newEvent') || searchParams.has('new') || searchParams.has('event')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('newEvent');
          next.delete('new');
          next.delete('event');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

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
      <section className={styles.calendarMain} aria-label="Calendar">
        <CalendarToolbar
          mode={mode}
          heading={heading}
          isFetching={result.isFetching && !result.isLoading}
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
            setIsEventEditorClosing(false);
            setSelectedOccurrence(null);
            setIsDraft(true);
          }}
        />

        <div className={styles.calendarSurface}>
          {result.isLoading ? (
            <CalendarState kind="loading" />
          ) : result.isError ? (
            <CalendarState kind="error" onRetry={result.refetch} />
          ) : (
            <div
              key={mode}
              className={`${styles.calendarViewTransition} ${
                transitionDirection === 'in'
                  ? styles.viewTransitionZoomIn
                  : transitionDirection === 'out'
                    ? styles.viewTransitionZoomOut
                    : styles.viewTransitionFade
              }`}
            >
              {mode === 'month' ? (
                <MonthView
                  dateKeys={window.dateKeys}
                  byDateKey={result.byDateKey}
                  selectedDateKey={selectedDateKey}
                  timeZone={timeZone}
                  now={new Date()}
                  onSelectDate={selectMonthDate}
                  onSelectEvent={(occurrence) => {
                    rememberOpeningControl();
                    setIsEventEditorClosing(false);
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
                    setIsEventEditorClosing(false);
                    setIsDraft(false);
                    setSelectedOccurrence(occurrence);
                  }}
                />
              )}
            </div>
          )}

          {!result.isLoading && !result.isError && result.occurrences.length === 0 ? (
            <div className={styles.emptyOverlay}>
              <CalendarState kind="empty" />
            </div>
          ) : null}
        </div>
      </section>

      {selectedOccurrence || isDraft || isEventEditorClosing ? (
        <>
          <button
            type="button"
            className={`${styles.detailsBackdrop} ${
              isEventEditorClosing ? styles.detailsBackdropClosing : ''
            }`}
            onClick={closeEventEditor}
            aria-label="Close event editor"
          />
          <EventEditor
            occurrence={selectedOccurrence}
            isDraft={isDraft}
            isClosing={isEventEditorClosing}
            selectedDateKey={selectedDateKey}
            calendars={result.calendars}
            timeZone={timeZone}
            defaultDurationMinutes={result.defaultEventMinutes}
            isSaving={createEvent.isPending || updateEvent.isPending || removeEvent.isPending}
            onClose={closeEventEditor}
            onCloseAnimationEnd={handleEventEditorCloseAnimationEnd}
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
