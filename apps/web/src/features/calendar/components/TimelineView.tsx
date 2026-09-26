import { minuteOfDay, toZonedDateKey } from '@cal/domain';
import type { HourCycle, WorkingHours } from '@cal/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';

import styles from './CalendarView.module.css';
import { EventButton } from './EventButton';
import { OriginGhost } from './OriginGhost';
import type { AnchorRect } from './QuickCreatePopover';
import { TimelineAllDayRow } from './TimelineAllDayRow';
import { TimelineDraftEvent } from './TimelineDraftEvent';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { useTimelineAutoScroll } from '../hooks/useTimelineAutoScroll';
import { useTimelineGestureFeedback } from '../hooks/useTimelineGestureFeedback';
import { useTimelineInitialScroll } from '../hooks/useTimelineInitialScroll';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useTimelineSlotSelection } from '../hooks/useTimelineSlotSelection';
import { dateKeyToInstant } from '../utils/calendar-window';
import {
  collectConflictCandidates,
  hasConflict as checkHasConflict,
  type ConflictCandidate,
} from '../utils/event-conflict';
import {
  collectMagneticTargets,
  snapMoveInterval,
  type MagneticTarget,
} from '../utils/event-magnetic-snap';
import {
  dateMinuteToInstant,
  hasTimingChanged,
  isEventMovable,
  isEventResizable,
  resolveMoveGesture,
  type MinuteInterval,
} from '../utils/event-resize';
import { layoutTimelineDay } from '../utils/timeline-day-layout';
import { formatHour, formatMinute } from '../utils/timeline-format';
import { offHoursBands } from '../utils/working-hours-bands';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export interface SlotSelection {
  dateKey: string;
  startMinute?: number;
  endMinute?: number;
  allDay?: boolean;
  anchorRect: AnchorRect;
}

export interface DraftEventState {
  dateKey: string;
  startMinute?: number;
  endMinute?: number;
  allDay?: boolean;
  title?: string;
  calendarColor?: string;
  isClosing?: boolean;
}

export interface EventTiming {
  start: number;
  end: number;
}

export interface TimelineViewProps {
  dateKeys: readonly string[];
  byDateKey: ReadonlyMap<string, EventOccurrence[]>;
  selectedDateKey: string;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onSelectDate: (dateKey: string) => void;
  onSelectEvent: (occurrence: EventOccurrence, anchorRect?: AnchorRect) => void;
  onResizeEvent?: (occurrence: EventOccurrence, timing: EventTiming) => void;
  onMoveEvent?: (occurrence: EventOccurrence, timing: EventTiming) => void;
  timingOverrides?: ReadonlyMap<string, EventTiming>;
  onSelectSlot?: (selection: SlotSelection) => void;
  draftEvent?: DraftEventState | null;
  defaultDurationMinutes?: number;
  workingHours?: WorkingHours;
  /** Event the calendar was opened for; the first scroll brings it into view instead of now. */
  revealEventId?: string | null;
  /** Show the time range and duration inside events long enough to fit them. */
  showEventDetails?: boolean;
  /** Shade the time outside `workingHours`. Snapping to working hours applies either way. */
  showWorkingHours?: boolean;
}

/** Shortest event, in minutes on the grid, that has room for the details line. */
export const EVENT_DETAILS_MIN_MINUTES = 45;

export function TimelineView({
  dateKeys,
  byDateKey,
  selectedDateKey,
  timeZone,
  hourCycle,
  now,
  onSelectDate,
  onSelectEvent,
  onResizeEvent,
  onMoveEvent,
  timingOverrides,
  onSelectSlot,
  draftEvent,
  defaultDurationMinutes = 60,
  workingHours,
  revealEventId = null,
  showEventDetails = false,
  showWorkingHours = true,
}: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isWeek = dateKeys.length > 1;
  const hourHeight = isWeek ? 54 : 64;
  const todayKey = toZonedDateKey(now, timeZone);

  const {
    dragSelection,
    handleColumnPointerDown,
    handleColumnPointerMove,
    handleColumnPointerUp,
    handleColumnPointerCancel,
  } = useTimelineSlotSelection({ hourHeight, defaultDurationMinutes, onSelectSlot });
  const [movePreview, setMovePreview] = useState<{
    occurrenceKey: string;
    dateKey: string;
    interval: MinuteInterval;
  } | null>(null);
  const {
    magneticSnap,
    hasConflict,
    snapDirection,
    settledOccurrenceKey,
    exitingGhost,
    setMagneticSnap,
    setHasConflict,
    setSnapDirection,
    triggerSettle,
    clearSettle,
    clearExitingGhost,
    showExitingGhost,
    suppressClick,
    releaseSuppressedClickSoon,
    shouldSuppressSelect,
  } = useTimelineGestureFeedback();

  const moveRef = useRef<{
    status: 'pending' | 'dragging';
    occurrence: EventOccurrence;
    originalDateKey: string;
    currentDateKey: string;
    startY: number;
    startX: number;
    originalMinutes: MinuteInterval;
    currentMinutes: MinuteInterval;
    originalLayout: { left: number; width: number };
    originalTiming: EventTiming;
    pointerId: number;
    button: HTMLButtonElement;
    columnTop: number;
    initialScrollTop: number;
    targets: MagneticTarget[];
    conflictCandidates: ConflictCandidate[];
  } | null>(null);
  const getMagneticTargetsForDate = (dateKey: string, activeKey: string) => {
    return collectMagneticTargets({
      occurrences: byDateKey.get(dateKey) ?? [],
      activeOccurrenceKey: activeKey,
      dateKey,
      timeZone,
      workingHours,
    });
  };

  const getConflictCandidatesForDate = (dateKey: string, activeKey: string) => {
    return collectConflictCandidates({
      occurrences: byDateKey.get(dateKey) ?? [],
      activeOccurrenceKey: activeKey,
      dateKey,
      timeZone,
    });
  };

  const findTargetDateKey = (clientX: number): string => {
    if (dateKeys.length <= 1) {
      return dateKeys[0] ?? selectedDateKey;
    }
    const container = scrollRef.current;
    if (!container) {
      return moveRef.current?.currentDateKey ?? selectedDateKey;
    }

    const columns = Array.from(container.querySelectorAll<HTMLElement>('[data-date-key]'));
    if (columns.length === 0) {
      return moveRef.current?.currentDateKey ?? selectedDateKey;
    }

    const validCols: Array<{ key: string; rect: DOMRect }> = [];
    for (const col of columns) {
      const key = col.getAttribute('data-date-key');
      if (key && dateKeys.includes(key)) {
        validCols.push({ key, rect: col.getBoundingClientRect() });
      }
    }

    const hasLayout = validCols.some((c) => c.rect.width > 0);
    if (hasLayout) {
      let closestKey = validCols[0]!.key;
      let minDistance = Infinity;
      for (const { key, rect } of validCols) {
        if (clientX >= rect.left && clientX < rect.right) {
          return key;
        }
        const center = (rect.left + rect.right) / 2;
        const dist = Math.abs(clientX - center);
        if (dist < minDistance) {
          minDistance = dist;
          closestKey = key;
        }
      }
      return closestKey;
    }

    return moveRef.current?.currentDateKey ?? selectedDateKey;
  };

  const applyMovePosition = (clientX: number, clientY: number, scrollTop: number) => {
    const active = moveRef.current;
    if (!active) return;

    const targetDateKey = findTargetDateKey(clientX);
    if (targetDateKey !== active.currentDateKey) {
      const oldIdx = dateKeys.indexOf(active.currentDateKey);
      const newIdx = dateKeys.indexOf(targetDateKey);
      const direction: 'left' | 'right' = newIdx >= oldIdx ? 'right' : 'left';
      active.currentDateKey = targetDateKey;
      active.targets = getMagneticTargetsForDate(targetDateKey, active.occurrence.key);
      active.conflictCandidates = getConflictCandidatesForDate(
        targetDateKey,
        active.occurrence.key,
      );
      setSnapDirection({
        key: active.occurrence.key,
        direction,
        id: Date.now(),
      });
    }

    const scrollDelta = scrollTop - active.initialScrollTop;
    const effectiveCurrentY = clientY + scrollDelta;

    const resolution = resolveMoveGesture({
      startY: active.startY,
      startX: active.startX,
      currentY: effectiveCurrentY,
      currentX: clientX,
      hourHeight,
      originalMinutes: active.originalMinutes,
      computeInterval: (deltaMinutes) =>
        snapMoveInterval({
          originalMinutes: active.originalMinutes,
          deltaMinutes,
          targets: active.targets,
        }),
    });

    if (resolution.type !== 'move' && resolution.type !== 'noop') {
      return;
    }

    if (active.status === 'pending') {
      active.status = 'dragging';
      clearSettle();
      suppressClick(active.occurrence.key);
      try {
        active.button.setPointerCapture(active.pointerId);
      } catch {
        // Pointer capture is best-effort in synthetic/test environments.
      }
    }

    const targetMinutes =
      resolution.type === 'noop' ? active.originalMinutes : resolution.nextMinutes;

    if (resolution.snap) {
      setMagneticSnap({
        dateKey: active.currentDateKey,
        minute: resolution.snap.snappedMinute,
        edge: resolution.snap.edge,
      });
    } else {
      setMagneticSnap(null);
    }

    const conflicting = checkHasConflict(targetMinutes, active.conflictCandidates);
    setHasConflict(conflicting);

    if (
      active.currentDateKey === movePreview?.dateKey &&
      targetMinutes.startMinute === active.currentMinutes.startMinute &&
      targetMinutes.endMinute === active.currentMinutes.endMinute
    ) {
      return;
    }

    const nextStart = dateMinuteToInstant(
      active.currentDateKey,
      targetMinutes.startMinute,
      timeZone,
    );
    const nextEnd = dateMinuteToInstant(active.currentDateKey, targetMinutes.endMinute, timeZone);
    if (!nextStart || !nextEnd || nextStart.getTime() >= nextEnd.getTime()) return;

    active.currentMinutes = targetMinutes;
    setMovePreview({
      occurrenceKey: active.occurrence.key,
      dateKey: active.currentDateKey,
      interval: targetMinutes,
    });
  };

  // The resize hook below needs these auto-scroll actions, and auto-scroll needs the resize
  // side back. The resize arrows forward to values declared below; they only run after
  // render, so each render's arrow reaches that render's `resizeRef` / `applyResizePosition`.
  const { stopAutoScroll, checkAndTriggerAutoScroll, trackPointer, clearPointer } =
    useTimelineAutoScroll(scrollRef, {
      isMoveDragging: () => moveRef.current?.status === 'dragging',
      isResizeActive: () => Boolean(resizeRef.current),
      applyResizeAt: (clientY, scrollTop) => applyResizePosition(clientY, scrollTop),
      applyMoveAt: applyMovePosition,
    });

  const {
    resizeRef,
    resizePreview,
    setResizePreview,
    applyResizePosition,
    handleResizePointerDown,
    handleResizePointerMove,
    finishResize,
  } = useTimelineResize(scrollRef, {
    hourHeight,
    timeZone,
    byDateKey,
    workingHours,
    timingOverrides,
    onResizeEvent,
    setMagneticSnap,
    setHasConflict,
    clearSettle,
    clearExitingGhost,
    suppressClick,
    releaseSuppressedClickSoon,
    triggerSettle,
    stopAutoScroll,
    checkAndTriggerAutoScroll,
    trackPointer,
    clearPointer,
  });

  const handleMovePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    occurrence: EventOccurrence,
    dateKey: string,
    interval: MinuteInterval,
    layout?: { left: number; width: number },
  ) => {
    if (e.button !== 0 || !onMoveEvent) return;
    if ((e.target as HTMLElement).closest('[data-resize-edge]')) return;
    const column = e.currentTarget.closest<HTMLElement>('[data-date-key]');
    if (!column) return;

    const override = timingOverrides?.get(occurrence.event.id);
    const originalTiming = override ?? { start: occurrence.start, end: occurrence.end };
    const targets = getMagneticTargetsForDate(dateKey, occurrence.key);
    const conflictCandidates = getConflictCandidatesForDate(dateKey, occurrence.key);

    moveRef.current = {
      status: 'pending',
      occurrence,
      originalDateKey: dateKey,
      currentDateKey: dateKey,
      startY: e.clientY,
      startX: e.clientX,
      originalMinutes: interval,
      currentMinutes: interval,
      originalLayout: layout ?? { left: 0, width: 1 },
      originalTiming,
      pointerId: e.pointerId,
      button: e.currentTarget,
      columnTop: column.getBoundingClientRect().top,
      initialScrollTop: scrollRef.current?.scrollTop ?? 0,
      targets,
      conflictCandidates,
    };
    trackPointer(e.clientX, e.clientY);
    clearExitingGhost();
    setHasConflict(false);
  };

  const handleMovePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const active = moveRef.current;
    if (!active || active.pointerId !== e.pointerId) return;

    trackPointer(e.clientX, e.clientY);
    const currentScrollTop = scrollRef.current?.scrollTop ?? active.initialScrollTop;
    applyMovePosition(e.clientX, e.clientY, currentScrollTop);
    if (active.status === 'dragging') {
      e.preventDefault();
      e.stopPropagation();
      checkAndTriggerAutoScroll();
    }
  };

  const finishMove = (
    e: React.PointerEvent<HTMLButtonElement> | PointerEvent,
    cancelled: boolean,
  ) => {
    stopAutoScroll();
    const active = moveRef.current;
    if (!active || ('pointerId' in e && active.pointerId !== e.pointerId)) return;

    try {
      active.button.releasePointerCapture(active.pointerId);
    } catch {
      // ignore
    }

    const wasDragging = active.status === 'dragging';
    const targetDateKey = active.currentDateKey;
    const occurrenceKey = active.occurrence.key;
    const originalTiming = active.originalTiming;
    const occurrence = active.occurrence;

    moveRef.current = null;
    clearPointer();
    setMovePreview(null);
    setMagneticSnap(null);
    setHasConflict(false);
    setSnapDirection(null);

    if (!wasDragging) {
      return;
    }

    showExitingGhost({
      occurrence: active.occurrence,
      dateKey: active.originalDateKey,
      originalMinutes: active.originalMinutes,
      originalLayout: active.originalLayout,
    });

    if ('preventDefault' in e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const suppressedKey = occurrenceKey;
    suppressClick(suppressedKey);
    releaseSuppressedClickSoon(suppressedKey);

    if (cancelled) return;

    const currentScrollTop = scrollRef.current?.scrollTop ?? active.initialScrollTop;
    const scrollDelta = currentScrollTop - active.initialScrollTop;
    const effectiveCurrentY = e.clientY + scrollDelta;

    const resolution = resolveMoveGesture({
      startY: active.startY,
      startX: active.startX,
      currentY: effectiveCurrentY,
      currentX: e.clientX,
      hourHeight,
      originalMinutes: active.originalMinutes,
      cancelled,
      computeInterval: (deltaMinutes) =>
        snapMoveInterval({
          originalMinutes: active.originalMinutes,
          deltaMinutes,
          targets: active.targets,
        }),
    });

    if (resolution.type !== 'move' && resolution.type !== 'noop') return;

    const finalMinutes =
      resolution.type === 'noop' ? active.originalMinutes : resolution.nextMinutes;

    const nextStart = dateMinuteToInstant(targetDateKey, finalMinutes.startMinute, timeZone);
    const nextEnd = dateMinuteToInstant(targetDateKey, finalMinutes.endMinute, timeZone);
    if (!nextStart || !nextEnd) return;

    const nextTiming = { start: nextStart.getTime(), end: nextEnd.getTime() };
    if (!hasTimingChanged(originalTiming, nextTiming)) return;
    triggerSettle(occurrenceKey);
    onMoveEvent?.(occurrence, nextTiming);
  };

  const handleMovePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => finishMove(e, false);
  const handleMovePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => finishMove(e, true);

  const moveHandlersRef = useRef({
    applyMovePosition,
    applyResizePosition,
    checkAndTriggerAutoScroll,
    finishMove,
    finishResize,
  });
  useEffect(() => {
    moveHandlersRef.current = {
      applyMovePosition,
      applyResizePosition,
      checkAndTriggerAutoScroll,
      finishMove,
      finishResize,
    };
  });

  useEffect(() => {
    // The event element normally holds pointer capture and handles these itself
    // (stopping propagation). These window listeners take over if capture is
    // lost, so a gesture can never outlive the mouse button being held.
    const onWindowPointerMove = (e: PointerEvent) => {
      const resize = resizeRef.current;
      if (resize && resize.pointerId === e.pointerId) {
        if (e.buttons === 0) {
          // The release happened somewhere we never heard about.
          moveHandlersRef.current.finishResize(e, false);
          return;
        }
        trackPointer(e.clientX, e.clientY);
        const scrollTop = scrollRef.current?.scrollTop ?? resize.initialScrollTop;
        moveHandlersRef.current.applyResizePosition(e.clientY, scrollTop);
        moveHandlersRef.current.checkAndTriggerAutoScroll();
        return;
      }

      const active = moveRef.current;
      if (!active || active.status !== 'dragging' || active.pointerId !== e.pointerId) return;
      if (e.buttons === 0) {
        moveHandlersRef.current.finishMove(e, false);
        return;
      }
      trackPointer(e.clientX, e.clientY);
      const currentScrollTop = scrollRef.current?.scrollTop ?? active.initialScrollTop;
      moveHandlersRef.current.applyMovePosition(e.clientX, e.clientY, currentScrollTop);
      moveHandlersRef.current.checkAndTriggerAutoScroll();
    };

    const onWindowPointerUp = (e: PointerEvent) => {
      if (resizeRef.current?.pointerId === e.pointerId) {
        moveHandlersRef.current.finishResize(e, false);
        return;
      }
      const active = moveRef.current;
      if (!active || active.status !== 'dragging' || active.pointerId !== e.pointerId) return;
      moveHandlersRef.current.finishMove(e, false);
    };

    const onWindowPointerCancel = (e: PointerEvent) => {
      if (resizeRef.current?.pointerId === e.pointerId) {
        moveHandlersRef.current.finishResize(e, true);
        return;
      }
      const active = moveRef.current;
      if (!active || active.status !== 'dragging' || active.pointerId !== e.pointerId) return;
      moveHandlersRef.current.finishMove(e, true);
    };

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
    };
    // Registered once; handlers are read from `moveHandlersRef`. `trackPointer` only
    // writes a ref, so the first render's copy behaves the same as later ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopAutoScroll();
        clearPointer();
        if (moveRef.current?.status === 'dragging') {
          const active = moveRef.current;
          try {
            active.button.releasePointerCapture(active.pointerId);
          } catch {
            // ignore
          }
          moveRef.current = null;
          setMovePreview(null);
          setMagneticSnap(null);
          setHasConflict(false);
          setSnapDirection(null);
          showExitingGhost({
            occurrence: active.occurrence,
            dateKey: active.originalDateKey,
            originalMinutes: active.originalMinutes,
            originalLayout: active.originalLayout,
          });
          const suppressedKey = active.occurrence.key;
          suppressClick(suppressedKey);
          releaseSuppressedClickSoon(suppressedKey);
        } else if (resizeRef.current) {
          const active = resizeRef.current;
          try {
            active.handle.releasePointerCapture(active.pointerId);
          } catch {
            // ignore
          }
          resizeRef.current = null;
          setResizePreview(null);
          setMagneticSnap(null);
          setHasConflict(false);
          const suppressedKey = active.occurrence.key;
          suppressClick(suppressedKey);
          releaseSuppressedClickSoon(suppressedKey);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // Registered once. The gesture-feedback and auto-scroll actions it calls only touch
    // refs and state setters, so the first render's copies behave the same as later ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTimelineInitialScroll(scrollRef, {
    dateKeys,
    byDateKey,
    revealEventId,
    todayKey,
    now,
    timeZone,
    hourHeight,
  });

  const allDayByDate = useMemo(
    () =>
      new Map(
        dateKeys.map((key) => [
          key,
          (byDateKey.get(key) ?? []).filter((item) => item.event.allDay),
        ]),
      ),
    [byDateKey, dateKeys],
  );
  const hasAllDay = [...allDayByDate.values()].some((events) => events.length > 0);

  const allTimedOccurrences = useMemo(() => {
    const seen = new Set<string>();
    const list: EventOccurrence[] = [];
    for (const occurrences of byDateKey.values()) {
      for (const occ of occurrences) {
        if (!occ.event.allDay && !seen.has(occ.key)) {
          seen.add(occ.key);
          list.push(occ);
        }
      }
    }
    return list;
  }, [byDateKey]);

  return (
    <div className={styles.timelineViewport} ref={scrollRef} data-timeline-viewport="true">
      <div
        className={`${styles.timelineCanvas} ${isWeek ? styles.weekCanvas : styles.dayCanvas} ${hasAllDay ? styles.timelineCanvasWithAllDay : ''}`}
        style={
          {
            '--hour-height': `${hourHeight}px`,
            '--day-count': dateKeys.length,
          } as React.CSSProperties
        }
      >
        <div className={styles.timelineHeaderSpacer} />
        <div className={styles.dayHeaders}>
          {dateKeys.map((dateKey) => {
            const dayStart = dateKeyToInstant(dateKey, timeZone);
            const isToday = dateKey === todayKey;
            return (
              <button
                key={dateKey}
                type="button"
                className={`${styles.dayHeader} ${dateKey === selectedDateKey ? styles.dayHeaderSelected : ''}`}
                onClick={() => onSelectDate(dateKey)}
                aria-pressed={dateKey === selectedDateKey}
              >
                <span>
                  {new Intl.DateTimeFormat('en-US', {
                    timeZone,
                    weekday: isWeek ? 'short' : 'long',
                  }).format(dayStart)}
                </span>
                <strong className={isToday ? styles.todayNumber : ''}>
                  {Number(dateKey.slice(-2))}
                </strong>
              </button>
            );
          })}
        </div>

        {hasAllDay ? (
          <TimelineAllDayRow
            dateKeys={dateKeys}
            allDayByDate={allDayByDate}
            timeZone={timeZone}
            hourCycle={hourCycle}
            draftEvent={draftEvent}
            onSelectEvent={onSelectEvent}
            onSelectSlot={onSelectSlot}
          />
        ) : null}

        <div className={styles.hourLabels}>
          {HOURS.map((hour) => (
            <span
              key={hour}
              className={hour === 0 ? styles.firstHourLabel : undefined}
              style={{ top: hour * hourHeight }}
            >
              {formatHour(hour, hourCycle)}
            </span>
          ))}
        </div>

        <div className={styles.dayColumns}>
          {dateKeys.map((dateKey) => {
            const activeResize = resizeRef.current;
            const activeMove = moveRef.current;
            const isDraggingMove =
              activeMove?.status === 'dragging' &&
              movePreview?.occurrenceKey === activeMove.occurrence.key;
            const { events: laidOut, draftPlacement } = layoutTimelineDay({
              dateKey,
              timeZone,
              occurrences: allTimedOccurrences,
              timingOverrides,
              resize: activeResize
                ? {
                    occurrenceKey: activeResize.occurrence.key,
                    originalMinutes: activeResize.originalMinutes,
                    currentMinutes: activeResize.currentMinutes,
                  }
                : null,
              resizePreviewKey: resizePreview?.occurrenceKey ?? null,
              move: isDraggingMove
                ? {
                    occurrenceKey: activeMove.occurrence.key,
                    dateKey: movePreview.dateKey,
                    originalMinutes: activeMove.originalMinutes,
                    currentMinutes: activeMove.currentMinutes,
                  }
                : null,
              draft: draftEvent,
              hasDragSelection: Boolean(dragSelection),
            });
            const nowTop =
              dateKey === todayKey ? (minuteOfDay(now, timeZone) / 60) * hourHeight : null;

            return (
              <div
                key={dateKey}
                data-date-key={dateKey}
                className={`${styles.dayColumn} ${dateKey === todayKey ? styles.todayColumn : ''}`}
                onPointerDown={(e) => handleColumnPointerDown(e, dateKey)}
                onPointerMove={(e) => handleColumnPointerMove(e, dateKey)}
                onPointerUp={(e) => handleColumnPointerUp(e, dateKey)}
                onPointerCancel={(e) => handleColumnPointerCancel(e, dateKey)}
              >
                {offHoursBands(dateKey, showWorkingHours ? (workingHours ?? []) : []).map(
                  (band) => (
                    <span
                      key={band.startMinute}
                      aria-hidden="true"
                      className={styles.offHoursBand}
                      style={{
                        top: (band.startMinute / 60) * hourHeight,
                        height: ((band.endMinute - band.startMinute) / 60) * hourHeight,
                      }}
                    />
                  ),
                )}
                {HOURS.map((hour) => (
                  <span key={hour} className={styles.hourLine} style={{ top: hour * hourHeight }} />
                ))}
                {dragSelection && dragSelection.dateKey === dateKey && (
                  <div
                    className={styles.dragSelectionIndicator}
                    style={{
                      top: (dragSelection.startMinute / 60) * hourHeight,
                      height: Math.max(
                        20,
                        ((dragSelection.endMinute - dragSelection.startMinute) / 60) * hourHeight -
                          2,
                      ),
                    }}
                  >
                    <span>
                      {formatMinute(dragSelection.startMinute, hourCycle)} –{' '}
                      {formatMinute(dragSelection.endMinute, hourCycle)}
                    </span>
                  </div>
                )}
                {draftEvent &&
                  draftEvent.dateKey === dateKey &&
                  !draftEvent.allDay &&
                  draftEvent.startMinute !== undefined &&
                  draftEvent.endMinute !== undefined &&
                  !dragSelection && (
                    <TimelineDraftEvent
                      startMinute={draftEvent.startMinute}
                      endMinute={draftEvent.endMinute}
                      placement={draftPlacement}
                      hourHeight={hourHeight}
                      hourCycle={hourCycle}
                      title={draftEvent.title}
                      calendarColor={draftEvent.calendarColor}
                      isClosing={draftEvent.isClosing}
                    />
                  )}
                {((isDraggingMove && activeMove && activeMove.originalDateKey === dateKey) ||
                  (exitingGhost && exitingGhost.dateKey === dateKey)) && (
                  <OriginGhost
                    occurrence={
                      isDraggingMove && activeMove
                        ? activeMove.occurrence
                        : exitingGhost!.occurrence
                    }
                    originalMinutes={
                      isDraggingMove && activeMove
                        ? activeMove.originalMinutes
                        : exitingGhost!.originalMinutes
                    }
                    originalLayout={
                      isDraggingMove && activeMove
                        ? activeMove.originalLayout
                        : exitingGhost!.originalLayout
                    }
                    hourHeight={hourHeight}
                    isWeek={isWeek}
                    isExiting={!isDraggingMove && Boolean(exitingGhost)}
                  />
                )}
                {laidOut.map((placed) => {
                  const sourceOccurrence =
                    (activeMove?.occurrence.key === placed.item.key
                      ? activeMove.occurrence
                      : undefined) ??
                    allTimedOccurrences.find((occ) => occ.key === placed.item.key) ??
                    placed.item;
                  const { startMinute, endMinute } = placed;
                  const top = (startMinute / 60) * hourHeight;
                  const height = Math.max(
                    ((endMinute - startMinute) / 60) * hourHeight - 2,
                    isWeek ? 20 : 24,
                  );
                  const canResize =
                    Boolean(onResizeEvent) && isEventResizable(sourceOccurrence, dateKey, timeZone);
                  const canMove =
                    (Boolean(onMoveEvent) && isEventMovable(sourceOccurrence, dateKey, timeZone)) ||
                    activeMove?.occurrence.key === placed.item.key;
                  const activeResizeInterval =
                    resizePreview?.occurrenceKey === placed.item.key
                      ? resizePreview.interval
                      : undefined;
                  const activeMoveInterval =
                    movePreview?.occurrenceKey === placed.item.key &&
                    movePreview.dateKey === dateKey
                      ? movePreview.interval
                      : undefined;
                  const showDetails =
                    showEventDetails && endMinute - startMinute >= EVENT_DETAILS_MIN_MINUTES;
                  return (
                    <EventButton
                      key={placed.item.key}
                      occurrence={placed.item}
                      timeZone={timeZone}
                      hourCycle={hourCycle}
                      compact={
                        (isWeek || height < 42) &&
                        !showDetails &&
                        !activeResizeInterval &&
                        !activeMoveInterval
                      }
                      showDetails={showDetails}
                      style={{
                        top,
                        height,
                        left: `calc(${placed.left * 100}% + 2px)`,
                        width: `calc(${placed.width * 100}% - 4px)`,
                      }}
                      onSelect={(anchorRect) => onSelectEvent(sourceOccurrence, anchorRect)}
                      onResizePointerDown={
                        canResize
                          ? (event, edge) =>
                              handleResizePointerDown(event, sourceOccurrence, dateKey, edge, {
                                startMinute,
                                endMinute,
                              })
                          : undefined
                      }
                      onResizePointerMove={handleResizePointerMove}
                      onResizePointerUp={(event) => finishResize(event, false)}
                      onResizePointerCancel={(event) => finishResize(event, true)}
                      onMovePointerDown={
                        canMove
                          ? (event) =>
                              handleMovePointerDown(
                                event,
                                sourceOccurrence,
                                dateKey,
                                {
                                  startMinute,
                                  endMinute,
                                },
                                {
                                  left: placed.left,
                                  width: placed.width,
                                },
                              )
                          : undefined
                      }
                      onMovePointerMove={canMove ? handleMovePointerMove : undefined}
                      onMovePointerUp={canMove ? handleMovePointerUp : undefined}
                      onMovePointerCancel={canMove ? handleMovePointerCancel : undefined}
                      shouldSuppressSelect={() => shouldSuppressSelect(sourceOccurrence.key)}
                      resizePreview={activeResizeInterval}
                      movePreview={activeMoveInterval}
                      isMovable={canMove}
                      isMagnetized={Boolean(
                        magneticSnap &&
                        magneticSnap.dateKey === dateKey &&
                        (resizePreview?.occurrenceKey === placed.item.key ||
                          movePreview?.occurrenceKey === placed.item.key),
                      )}
                      hasConflict={Boolean(
                        hasConflict &&
                        movePreview?.dateKey === dateKey &&
                        (resizePreview?.occurrenceKey === placed.item.key ||
                          movePreview?.occurrenceKey === placed.item.key),
                      )}
                      isSettled={
                        settledOccurrenceKey === placed.item.key ||
                        settledOccurrenceKey === placed.item.event.id
                      }
                      snapDirection={
                        activeMove?.occurrence.key === placed.item.key &&
                        snapDirection?.key === placed.item.key &&
                        movePreview?.dateKey === dateKey
                          ? snapDirection.direction
                          : null
                      }
                    />
                  );
                })}
                {magneticSnap && magneticSnap.dateKey === dateKey && (
                  <div
                    className={styles.timelineMagneticGuide}
                    style={{ top: (magneticSnap.minute / 60) * hourHeight }}
                    data-snap-edge={magneticSnap.edge}
                    data-snap-minute={magneticSnap.minute}
                  />
                )}
                {nowTop !== null ? (
                  <span className={styles.nowLine} style={{ top: nowTop }}>
                    <i />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
