import { toZonedDateKey } from '@cal/domain';
import type { Calendar } from '@cal/schemas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CalendarEditor } from './CalendarEditor';
import { CalendarToolbar } from './CalendarToolbar';
import styles from './CalendarView.module.css';
import { EventEditor } from './EventEditor';
import { MonthView } from './MonthView';
import { QuickCreatePopover, type AnchorRect } from './QuickCreatePopover';
import { TimelineView, type EventTiming, type SlotSelection } from './TimelineView';
import { useCreateTask } from '../../tasks/hooks/useTasks';
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
import { eventInputWithTiming, type EventFormValues } from '../utils/event-form';

interface CalendarToast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

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
  const [toast, setToast] = useState<CalendarToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timingOverrides, setTimingOverrides] = useState<ReadonlyMap<string, EventTiming>>(
    () => new Map(),
  );
  const openingControlRef = useRef<HTMLElement | null>(null);

  const [quickCreateState, setQuickCreateState] = useState<{
    isOpen: boolean;
    dateKey: string;
    startMinute?: number;
    endMinute?: number;
    startTime?: string;
    endTime?: string;
    allDay?: boolean;
    anchorRect: AnchorRect | null;
    editingOccurrence?: EventOccurrence | null;
  }>({
    isOpen: false,
    dateKey: selectedDateKey,
    anchorRect: null,
    editingOccurrence: null,
  });
  const [draftState, setDraftState] = useState<{
    title: string;
    calendarColor: string;
  } | null>(null);
  const [isDraftClosing, setIsDraftClosing] = useState(false);
  const [editorInitialValues, setEditorInitialValues] = useState<Partial<EventFormValues> | null>(
    null,
  );
  const createTaskMutation = useCreateTask();

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
      setIsDraft(false);

      const todayKey = toZonedDateKey(new Date(), timeZone);
      const todayElement = document.querySelector(`[data-date-key="${todayKey}"]`);
      let anchorRect: AnchorRect | null = null;
      if (todayElement instanceof HTMLElement) {
        const rect = todayElement.getBoundingClientRect();
        anchorRect = {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      }

      setQuickCreateState({
        isOpen: true,
        dateKey: todayKey,
        allDay: false,
        anchorRect,
      });
    } else {
      setToast({ message: 'Create or connect a writable calendar first.' });
    }
  }, [hasRequestedNewEvent, result.isLoading, result.calendars, timeZone]);

  const rememberOpeningControl = useCallback(() => {
    openingControlRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const handleEventSelect = useCallback(
    (occurrence: EventOccurrence, anchorRect?: AnchorRect) => {
      rememberOpeningControl();
      setIsDraft(false);
      setSelectedOccurrence(null);

      let finalAnchorRect = anchorRect ?? null;
      if (!finalAnchorRect) {
        const dateKey = toZonedDateKey(new Date(occurrence.start), timeZone);
        const cell = document.querySelector(`[data-date-key="${dateKey}"]`);
        if (cell instanceof HTMLElement) {
          const r = cell.getBoundingClientRect();
          finalAnchorRect = {
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            width: r.width,
            height: r.height,
          };
        }
      }

      const dateKey = toZonedDateKey(new Date(occurrence.start), timeZone);
      setSelectedDateKey(dateKey);

      setQuickCreateState({
        isOpen: true,
        dateKey,
        anchorRect: finalAnchorRect,
        editingOccurrence: occurrence,
      });
    },
    [timeZone, rememberOpeningControl],
  );

  useEffect(() => {
    if (!requestedEventId) return;
    const occurrence = result.occurrences.find((item) => item.event.id === requestedEventId);
    if (occurrence) {
      handleEventSelect(occurrence);
      setRequestedEventId(null);
    }
  }, [requestedEventId, result.occurrences, handleEventSelect]);

  const heading = useMemo(
    () => formatRangeHeading(mode, selectedDateKey, window, timeZone),
    [mode, selectedDateKey, timeZone, window],
  );

  const handleSlotSelect = useCallback(
    ({ dateKey, startMinute, endMinute, allDay, anchorRect }: SlotSelection) => {
      if (!result.calendars.some((c) => !c.isReadOnly)) {
        setToast({ message: 'Create or connect a writable calendar first.' });
        return;
      }
      rememberOpeningControl();
      setSelectedDateKey(dateKey);
      setIsDraft(false);
      setSelectedOccurrence(null);

      const pad = (n: number) => String(n).padStart(2, '0');
      const startTime =
        startMinute !== undefined
          ? `${pad(Math.floor(startMinute / 60))}:${pad(startMinute % 60)}`
          : undefined;
      const endTime =
        endMinute !== undefined
          ? `${pad(Math.floor(endMinute / 60))}:${pad(endMinute % 60)}`
          : undefined;

      setIsDraftClosing(false);
      setQuickCreateState({
        isOpen: true,
        dateKey,
        startMinute,
        endMinute,
        startTime,
        endTime,
        allDay: allDay ?? false,
        anchorRect,
        editingOccurrence: null,
      });
    },
    [result.calendars, rememberOpeningControl],
  );

  const activeDraftEvent = useMemo(() => {
    if (!quickCreateState.isOpen || quickCreateState.editingOccurrence) return null;
    return {
      dateKey: quickCreateState.dateKey,
      startMinute: quickCreateState.startMinute,
      endMinute: quickCreateState.endMinute,
      allDay: quickCreateState.allDay,
      title: draftState?.title,
      calendarColor: draftState?.calendarColor,
      isClosing: isDraftClosing,
    };
  }, [quickCreateState, draftState, isDraftClosing]);

  const handleToggleVisibility = useCallback(
    (calendar: Calendar) => {
      toggleVisibility.mutate(
        { id: calendar.id, isVisible: !calendar.isVisible },
        {
          onError: (error) =>
            setToast({
              message: error instanceof Error ? error.message : 'Visibility could not be saved.',
            }),
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
      setIsDraftClosing(false);
      setIsEventEditorClosing(false);
      setQuickCreateState((prev) => ({ ...prev, isOpen: false }));
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
    setEditorInitialValues(null);
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

  const closeCalendarEditor = useCallback(() => {
    setCalendarEditorOpen(false);
    globalThis.requestAnimationFrame(() => openingControlRef.current?.focus());
  }, []);

  const showToast = useCallback((nextToast: CalendarToast, duration = 6000) => {
    if (toastTimerRef.current) globalThis.clearTimeout(toastTimerRef.current);
    setToast(nextToast);
    toastTimerRef.current = globalThis.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, duration);
  }, []);

  const showSuccess = useCallback((message: string) => showToast({ message }, 3000), [showToast]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) globalThis.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const reflectedEventIds = [...timingOverrides]
      .filter(([eventId, timing]) => {
        const authoritative = result.occurrences.find(
          (occurrence) => occurrence.event.id === eventId,
        );
        return authoritative?.start === timing.start && authoritative.end === timing.end;
      })
      .map(([eventId]) => eventId);
    if (reflectedEventIds.length === 0) return;

    setTimingOverrides((current) => {
      const next = new Map(current);
      reflectedEventIds.forEach((eventId) => next.delete(eventId));
      return next;
    });
  }, [result.occurrences, timingOverrides]);

  const setTimingOverride = useCallback((eventId: string, timing: EventTiming | null) => {
    setTimingOverrides((current) => {
      const next = new Map(current);
      if (timing) next.set(eventId, timing);
      else next.delete(eventId);
      return next;
    });
  }, []);

  const handleResizeEvent = useCallback(
    (occurrence: EventOccurrence, timing: EventTiming) => {
      const { event } = occurrence;
      const previous = timingOverrides.get(event.id) ?? {
        start: occurrence.start,
        end: occurrence.end,
      };
      if (previous.start === timing.start && previous.end === timing.end) return;

      setTimingOverride(event.id, timing);
      const persist = async () => {
        try {
          await updateEvent.mutateAsync({
            event,
            input: eventInputWithTiming(
              event,
              new Date(timing.start).toISOString(),
              new Date(timing.end).toISOString(),
            ),
          });
          showToast({
            message: 'Event resized',
            actionLabel: 'Undo',
            onAction: () => {
              setTimingOverride(event.id, previous);
              showToast({ message: 'Restoring event…' });
              void updateEvent
                .mutateAsync({
                  event,
                  input: eventInputWithTiming(
                    event,
                    new Date(previous.start).toISOString(),
                    new Date(previous.end).toISOString(),
                  ),
                })
                .then(() => showSuccess('Resize undone.'))
                .catch(() => {
                  setTimingOverride(event.id, null);
                  result.refetch();
                  showToast({ message: 'The resize could not be undone.' });
                });
            },
          });
        } catch {
          setTimingOverride(event.id, null);
          showToast({ message: 'The event resize could not be saved.' });
        }
      };
      void persist();
    },
    [result, showSuccess, showToast, setTimingOverride, timingOverrides, updateEvent],
  );

  const handleMoveEvent = useCallback(
    (occurrence: EventOccurrence, timing: EventTiming) => {
      const { event } = occurrence;
      const previous = timingOverrides.get(event.id) ?? {
        start: occurrence.start,
        end: occurrence.end,
      };
      if (previous.start === timing.start && previous.end === timing.end) return;

      setTimingOverride(event.id, timing);
      const persist = async () => {
        try {
          await updateEvent.mutateAsync({
            event,
            input: eventInputWithTiming(
              event,
              new Date(timing.start).toISOString(),
              new Date(timing.end).toISOString(),
            ),
          });
          showToast({
            message: 'Event moved',
            actionLabel: 'Undo',
            onAction: () => {
              setTimingOverride(event.id, previous);
              showToast({ message: 'Restoring event…' });
              void updateEvent
                .mutateAsync({
                  event,
                  input: eventInputWithTiming(
                    event,
                    new Date(previous.start).toISOString(),
                    new Date(previous.end).toISOString(),
                  ),
                })
                .then(() => showSuccess('Move undone.'))
                .catch(() => {
                  setTimingOverride(event.id, null);
                  result.refetch();
                  showToast({ message: 'The move could not be undone.' });
                });
            },
          });
        } catch {
          setTimingOverride(event.id, null);
          showToast({ message: 'The event move could not be saved.' });
        }
      };
      void persist();
    },
    [result, showSuccess, showToast, setTimingOverride, timingOverrides, updateEvent],
  );

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
              setToast({ message: 'Create or connect a writable calendar first.' });
              return;
            }
            rememberOpeningControl();
            setIsDraft(false);
            setSelectedOccurrence(null);

            const todayKey = toZonedDateKey(new Date(), timeZone);
            setSelectedDateKey(todayKey);

            // Locate today's square/column in the active calendar view to anchor popover to its left
            const todayElement = document.querySelector(`[data-date-key="${todayKey}"]`);
            let anchorRect: AnchorRect | null = null;

            if (todayElement instanceof HTMLElement) {
              const rect = todayElement.getBoundingClientRect();
              anchorRect = {
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
              };
            } else {
              const buttonRect = openingControlRef.current?.getBoundingClientRect() ?? null;
              if (buttonRect) {
                anchorRect = {
                  top: buttonRect.top,
                  bottom: buttonRect.bottom,
                  left: buttonRect.left,
                  right: buttonRect.right,
                  width: buttonRect.width,
                  height: buttonRect.height,
                };
              }
            }

            setQuickCreateState({
              isOpen: true,
              dateKey: todayKey,
              allDay: false,
              anchorRect,
            });
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
                  onSelectEvent={handleEventSelect}
                  onSelectSlot={handleSlotSelect}
                  draftEvent={activeDraftEvent}
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
                  onSelectEvent={handleEventSelect}
                  onResizeEvent={handleResizeEvent}
                  onMoveEvent={handleMoveEvent}
                  timingOverrides={timingOverrides}
                  onSelectSlot={handleSlotSelect}
                  draftEvent={activeDraftEvent}
                  defaultDurationMinutes={result.defaultEventMinutes}
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

      <QuickCreatePopover
        isOpen={quickCreateState.isOpen}
        anchorRect={quickCreateState.anchorRect}
        selectedDateKey={quickCreateState.dateKey}
        initialStartTime={quickCreateState.startTime}
        initialEndTime={quickCreateState.endTime}
        initialAllDay={quickCreateState.allDay}
        editingOccurrence={quickCreateState.editingOccurrence}
        calendars={result.calendars}
        timeZone={timeZone}
        defaultDurationMinutes={result.defaultEventMinutes}
        isSaving={
          createEvent.isPending ||
          updateEvent.isPending ||
          removeEvent.isPending ||
          createTaskMutation.isPending
        }
        onClosing={() => setIsDraftClosing(true)}
        onClose={() => {
          setIsDraftClosing(false);
          setQuickCreateState((prev) => ({ ...prev, isOpen: false, editingOccurrence: null }));
        }}
        onCreateEvent={async (input) => {
          await createEvent.mutateAsync(input);
          setQuickCreateState((prev) => ({ ...prev, isOpen: false, editingOccurrence: null }));
          showSuccess('Event created.');
        }}
        onUpdateEvent={async (event, input) => {
          await updateEvent.mutateAsync({ event, input });
          setQuickCreateState((prev) => ({ ...prev, isOpen: false, editingOccurrence: null }));
          showSuccess('Event updated.');
        }}
        onDeleteEvent={async (event) => {
          await removeEvent.mutateAsync(event);
          setQuickCreateState((prev) => ({ ...prev, isOpen: false, editingOccurrence: null }));
          showSuccess('Event deleted.');
        }}
        onCreateTask={async (input) => {
          await createTaskMutation.mutateAsync(input);
          setQuickCreateState((prev) => ({ ...prev, isOpen: false, editingOccurrence: null }));
          showSuccess('Task created.');
        }}
        onMoreOptions={(draftValues) => {
          setEditorInitialValues(draftValues);
          if (quickCreateState.editingOccurrence) {
            setSelectedOccurrence(quickCreateState.editingOccurrence);
          } else {
            setIsDraft(true);
          }
          setQuickCreateState((prev) => ({ ...prev, isOpen: false, editingOccurrence: null }));
          setIsEventEditorClosing(false);
        }}
        onDraftChange={(draft) => setDraftState(draft)}
      />

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
            initialFormValues={editorInitialValues}
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
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction ? (
            <button type="button" onClick={toast.onAction}>
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
