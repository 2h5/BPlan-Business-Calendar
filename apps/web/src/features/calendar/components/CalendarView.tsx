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
import { useCalendarViewHotkeys } from '../hooks/useCalendarViewHotkeys';
import { type EventOccurrence, useCalendarWindow } from '../hooks/useCalendarWindow';
import {
  getActiveCalendarView,
  isValidCalendarViewMode,
  setLastCalendarView,
  viewForLinkedEvent,
} from '../utils/calendar-preferences';
import { type CalendarViewMode, formatRangeHeading, shiftDateKey } from '../utils/calendar-window';
import {
  eventInputFromForm,
  eventInputWithTiming,
  eventToFormValues,
  type EventFormValues,
} from '../utils/event-form';
import { getNewEventSlotDefaults } from '../utils/new-event-defaults';
import {
  getTransitionOrigin,
  getViewTransitionDirection,
  type ViewTransitionState,
} from '../utils/view-transition';

interface CalendarToast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

function getNewEventAnchorRect(
  dateKey: string,
  startMinute: number,
  endMinute: number,
  mode: CalendarViewMode,
): AnchorRect | null {
  const dayElement = document.querySelector<HTMLElement>(`[data-date-key="${dateKey}"]`);
  if (!dayElement) return null;
  const rect = dayElement.getBoundingClientRect();
  if (mode === 'month') {
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
  }

  const hourHeight = mode === 'week' ? 54 : 64;
  const top = rect.top + (startMinute / 60) * hourHeight;
  const height = Math.max(22, ((endMinute - startMinute) / 60) * hourHeight - 2);
  return {
    top,
    bottom: top + height,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height,
  };
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
    if (isValidCalendarViewMode(viewParam)) {
      setLastCalendarView(viewParam);
      return viewParam;
    }
    const activeView = getActiveCalendarView();
    return searchParams.has('event') ? viewForLinkedEvent(activeView) : activeView;
  });
  const [transitionState, setTransitionState] = useState<ViewTransitionState | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [isToastExiting, setIsToastExiting] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const { window: calendarWindow, timeZone, weekStartsOn } = result;

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

    // Treat route-driven creation as a one-shot intent. Leaving the flag in
    // the URL causes a view change to close the composer and immediately open
    // a new one when this effect reruns for the next calendar mode.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('newEvent');
        next.delete('new');
        return next;
      },
      { replace: true },
    );

    if (result.calendars.some((calendar) => !calendar.isReadOnly)) {
      setIsEventEditorClosing(false);
      setSelectedOccurrence(null);
      setIsDraft(false);

      const slot = getNewEventSlotDefaults(new Date(), timeZone, result.defaultEventMinutes);
      setSelectedDateKey(slot.dateKey);

      setQuickCreateState({
        isOpen: true,
        dateKey: slot.dateKey,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        startTime: slot.startTime,
        endTime: slot.endTime,
        allDay: false,
        anchorRect: getNewEventAnchorRect(slot.dateKey, slot.startMinute, slot.endMinute, mode),
      });
    } else {
      setToast({ message: 'Create or connect a writable calendar first.' });
    }
  }, [
    hasRequestedNewEvent,
    mode,
    result.defaultEventMinutes,
    result.isLoading,
    result.calendars,
    setSearchParams,
    timeZone,
  ]);

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
    () => formatRangeHeading(mode, selectedDateKey, calendarWindow, timeZone),
    [mode, selectedDateKey, timeZone, calendarWindow],
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
    (nextMode: CalendarViewMode, targetDateKey?: string) => {
      if (nextMode === mode) return;
      setLastCalendarView(nextMode);

      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const direction = getViewTransitionDirection(mode, nextMode);
      if (direction && !prefersReducedMotion) {
        const origin = getTransitionOrigin({
          fromMode: mode,
          toMode: nextMode,
          selectedDateKey: targetDateKey ?? selectedDateKey,
          timeZone,
          weekStartsOn,
          dateKeys: calendarWindow.dateKeys,
        });
        setTransitionState({ direction, origin });

        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = setTimeout(() => {
          setTransitionState(null);
          transitionTimerRef.current = null;
        }, 240);
      } else {
        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = null;
        }
        setTransitionState(null);
      }

      setMode(nextMode);
      setSelectedOccurrence(null);
      setIsDraft(false);
      setIsDraftClosing(false);
      setIsEventEditorClosing(false);
      setQuickCreateState((prev) => ({ ...prev, isOpen: false }));
    },
    [mode, selectedDateKey, timeZone, weekStartsOn, calendarWindow.dateKeys],
  );

  useCalendarViewHotkeys(
    changeMode,
    quickCreateState.isOpen || !!selectedOccurrence || isDraft || calendarEditorOpen,
  );

  const viewParam = searchParams.get('view');
  useEffect(() => {
    if (isValidCalendarViewMode(viewParam) && viewParam !== mode) {
      changeMode(viewParam);
    }
  }, [viewParam, mode, changeMode]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const selectMonthDate = useCallback(
    (dateKey: string) => {
      setSelectedDateKey(dateKey);
      changeMode('day', dateKey);
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

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      globalThis.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (toastExitTimerRef.current) {
      globalThis.clearTimeout(toastExitTimerRef.current);
      toastExitTimerRef.current = null;
    }
    setIsToastExiting(true);
    toastExitTimerRef.current = globalThis.setTimeout(() => {
      setToast(null);
      setIsToastExiting(false);
      toastExitTimerRef.current = null;
    }, 180);
  }, []);

  const showToast = useCallback(
    (nextToast: CalendarToast, duration = 6000) => {
      if (toastTimerRef.current) {
        globalThis.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      if (toastExitTimerRef.current) {
        globalThis.clearTimeout(toastExitTimerRef.current);
        toastExitTimerRef.current = null;
      }
      setToast(nextToast);
      setIsToastExiting(false);
      toastTimerRef.current = globalThis.setTimeout(() => {
        dismissToast();
      }, duration);
    },
    [dismissToast],
  );

  const showSuccess = useCallback((message: string) => showToast({ message }, 3000), [showToast]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) globalThis.clearTimeout(toastTimerRef.current);
      if (toastExitTimerRef.current) globalThis.clearTimeout(toastExitTimerRef.current);
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

            const slot = getNewEventSlotDefaults(new Date(), timeZone, result.defaultEventMinutes);
            setSelectedDateKey(slot.dateKey);

            let anchorRect = getNewEventAnchorRect(
              slot.dateKey,
              slot.startMinute,
              slot.endMinute,
              mode,
            );
            if (!anchorRect) {
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
              dateKey: slot.dateKey,
              startMinute: slot.startMinute,
              endMinute: slot.endMinute,
              startTime: slot.startTime,
              endTime: slot.endTime,
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
                transitionState?.direction === 'in'
                  ? styles.viewTransitionZoomIn
                  : transitionState?.direction === 'out'
                    ? styles.viewTransitionZoomOut
                    : ''
              }`}
              style={
                transitionState
                  ? {
                      transformOrigin: `${transitionState.origin.x}% ${transitionState.origin.y}%`,
                    }
                  : undefined
              }
            >
              {mode === 'month' ? (
                <MonthView
                  dateKeys={calendarWindow.dateKeys}
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
                  dateKeys={calendarWindow.dateKeys}
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
                  workingHours={result.workingHours}
                  revealEventId={requestedEventId}
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
          showToast(
            {
              message: 'Event deleted.',
              actionLabel: 'Undo',
              onAction: () => {
                showToast({ message: 'Restoring event…' });
                void createEvent
                  .mutateAsync(eventInputFromForm(eventToFormValues(event), event.timezone, event))
                  .then(() => showSuccess('Event restored.'))
                  .catch(() => showToast({ message: 'The event could not be restored.' }));
              },
            },
            8000,
          );
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
        <div
          className={`${styles.toast} ${isToastExiting ? styles.toastExiting : ''}`}
          role="status"
          aria-live="polite"
        >
          <span className={styles.toastMessage} key={toast.message}>
            {toast.message === 'Restoring event…' ? (
              <span className={styles.toastSpinner} aria-hidden="true" />
            ) : null}
            <span>{toast.message}</span>
          </span>
          {toast.actionLabel && toast.onAction && !isToastExiting ? (
            <button type="button" onClick={toast.onAction}>
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
