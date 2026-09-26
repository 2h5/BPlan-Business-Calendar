import { minuteOfDay, toZonedDateKey } from '@cal/domain';
import type { HourCycle, WorkingHours } from '@cal/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';

import styles from './CalendarView.module.css';
import { EventButton } from './EventButton';
import { OriginGhost } from './OriginGhost';
import type { AnchorRect } from './QuickCreatePopover';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../utils/calendar-window';
import { calculateAutoScrollVelocity, clampScrollTop } from '../utils/event-auto-scroll';
import {
  collectConflictCandidates,
  hasConflict as checkHasConflict,
  type ConflictCandidate,
} from '../utils/event-conflict';
import {
  collectMagneticTargets,
  snapMoveInterval,
  snapResizeInterval,
  type MagneticTarget,
} from '../utils/event-magnetic-snap';
import {
  dateMinuteToInstant,
  hasTimingChanged,
  isEventMovable,
  isEventResizable,
  resolveMoveGesture,
  type MinuteInterval,
  type ResizeEdge,
} from '../utils/event-resize';
import { layoutTimelineDay } from '../utils/timeline-day-layout';
import { formatHour, formatMinute } from '../utils/timeline-format';
import { initialScrollHour } from '../utils/timeline-initial-scroll';
import { offHoursBands } from '../utils/working-hours-bands';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOLD_DELAY_MS = 180;
const SETTLE_ANIMATION_MS = 180;
const GHOST_EXIT_ANIMATION_MS = 140;

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
  const initialScrollKeyRef = useRef<string | null>(null);
  const isWeek = dateKeys.length > 1;
  const hourHeight = isWeek ? 54 : 64;
  const todayKey = toZonedDateKey(now, timeZone);

  const [dragSelection, setDragSelection] = useState<{
    dateKey: string;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    occurrenceKey: string;
    interval: MinuteInterval;
  } | null>(null);
  const [movePreview, setMovePreview] = useState<{
    occurrenceKey: string;
    dateKey: string;
    interval: MinuteInterval;
  } | null>(null);
  const [snapDirection, setSnapDirection] = useState<{
    key: string;
    direction: 'left' | 'right';
    id: number;
  } | null>(null);
  const [magneticSnap, setMagneticSnap] = useState<{
    dateKey: string;
    minute: number;
    edge: 'start' | 'end';
  } | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [settledOccurrenceKey, setSettledOccurrenceKey] = useState<string | null>(null);
  const [exitingGhost, setExitingGhost] = useState<{
    occurrence: EventOccurrence;
    dateKey: string;
    originalMinutes: MinuteInterval;
    originalLayout: { left: number; width: number };
  } | null>(null);
  const ghostExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExitingGhost = () => {
    if (ghostExitTimerRef.current) {
      clearTimeout(ghostExitTimerRef.current);
      ghostExitTimerRef.current = null;
    }
    setExitingGhost(null);
  };

  const resizeRef = useRef<{
    occurrence: EventOccurrence;
    dateKey: string;
    edge: ResizeEdge;
    originalMinutes: MinuteInterval;
    currentMinutes: MinuteInterval;
    originalTiming: EventTiming;
    pointerId: number;
    handle: HTMLSpanElement;
    columnTop: number;
    initialScrollTop: number;
    targets: MagneticTarget[];
    conflictCandidates: ConflictCandidate[];
  } | null>(null);

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
  const suppressedClickKeyRef = useRef<string | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };

  const triggerSettle = (occurrenceKey: string) => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setSettledOccurrenceKey(occurrenceKey);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setSettledOccurrenceKey((current) => (current === occurrenceKey ? null : current));
    }, SETTLE_ANIMATION_MS);
  };

  const clearSettle = () => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setSettledOccurrenceKey(null);
  };

  const dragRef = useRef<{
    dateKey: string;
    startY: number;
    startX: number;
    startMinute: number;
    colRect: DOMRect;
  } | null>(null);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      stopAutoScroll();
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
      if (ghostExitTimerRef.current) {
        clearTimeout(ghostExitTimerRef.current);
      }
    };
  }, []);

  const handleColumnPointerDown = (e: React.PointerEvent<HTMLDivElement>, dateKey: string) => {
    if ((e.target as HTMLElement).closest(`.${styles.timelineEvent}`)) return;
    if (e.button !== 0) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    const colRect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - colRect.top;
    const rawMinute = (y / hourHeight) * 60;
    const startMinute = Math.max(0, Math.min(23 * 60 + 45, Math.floor(rawMinute / 15) * 15));

    dragRef.current = {
      dateKey,
      startY: e.clientY,
      startX: e.clientX,
      startMinute,
      colRect,
    };

    // If user holds down the pointer, display the 15-minute selection box after the hold delay.
    // Quick clicks release before this timer fires, preventing any 1-frame flash before the animation.
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (dragRef.current && dragRef.current.dateKey === dateKey) {
        setDragSelection({
          dateKey,
          startMinute,
          endMinute: Math.min(24 * 60, startMinute + 15),
        });
      }
    }, HOLD_DELAY_MS);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleColumnPointerMove = (e: React.PointerEvent<HTMLDivElement>, dateKey: string) => {
    if (!dragRef.current || dragRef.current.dateKey !== dateKey) return;

    const distY = Math.abs(e.clientY - dragRef.current.startY);
    const distX = Math.abs(e.clientX - dragRef.current.startX);
    const hasMoved = distY >= 6 || distX >= 6;

    if (!hasMoved && !dragSelection) {
      return;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    const colRect = dragRef.current.colRect;
    const y = Math.max(0, Math.min(colRect.height, e.clientY - colRect.top));
    const rawMinute = (y / hourHeight) * 60;
    const currentSnapped = Math.max(0, Math.min(24 * 60, Math.floor(rawMinute / 15) * 15));

    const startMin = Math.min(dragRef.current.startMinute, currentSnapped);
    const endMin = Math.max(dragRef.current.startMinute, currentSnapped) + 15;

    setDragSelection({
      dateKey,
      startMinute: startMin,
      endMinute: Math.min(24 * 60, endMin),
    });
  };

  const handleColumnPointerUp = (e: React.PointerEvent<HTMLDivElement>, dateKey: string) => {
    if (!dragRef.current || dragRef.current.dateKey !== dateKey) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const dragInfo = dragRef.current;
    dragRef.current = null;

    const distY = Math.abs(e.clientY - dragInfo.startY);
    const distX = Math.abs(e.clientX - dragInfo.startX);
    const isClick = distY < 6 && distX < 6;

    let finalStart = dragInfo.startMinute;
    let finalEnd = Math.min(24 * 60, dragInfo.startMinute + defaultDurationMinutes);

    if (!isClick && dragSelection) {
      finalStart = dragSelection.startMinute;
      finalEnd = dragSelection.endMinute;
    }

    setDragSelection(null);

    if (onSelectSlot) {
      const slotTop = dragInfo.colRect.top + (finalStart / 60) * hourHeight;
      const slotHeight = Math.max(20, ((finalEnd - finalStart) / 60) * hourHeight);
      const anchorRect: AnchorRect = {
        top: slotTop,
        bottom: slotTop + slotHeight,
        left: dragInfo.colRect.left,
        right: dragInfo.colRect.right,
        width: dragInfo.colRect.width,
        height: slotHeight,
      };

      onSelectSlot({
        dateKey,
        startMinute: finalStart,
        endMinute: finalEnd,
        anchorRect,
      });
    }
  };

  const handleColumnPointerCancel = (e: React.PointerEvent<HTMLDivElement>, dateKey: string) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (dragRef.current?.dateKey === dateKey) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragRef.current = null;
      setDragSelection(null);
    }
  };

  const applyResizePosition = (clientY: number, scrollTop: number) => {
    const active = resizeRef.current;
    if (!active) return;

    const scrollDelta = scrollTop - active.initialScrollTop;
    const rawMinute = ((clientY - active.columnTop + scrollDelta) / hourHeight) * 60;
    const snapResult = snapResizeInterval({
      originalMinutes: active.originalMinutes,
      edge: active.edge,
      rawPointerMinute: rawMinute,
      targets: active.targets,
    });
    const next = snapResult.interval;

    if (snapResult.snap) {
      setMagneticSnap({
        dateKey: active.dateKey,
        minute: snapResult.snap.snappedMinute,
        edge: snapResult.snap.edge,
      });
    } else {
      setMagneticSnap(null);
    }

    const conflicting = checkHasConflict(next, active.conflictCandidates);
    setHasConflict(conflicting);

    if (
      next.startMinute === active.currentMinutes.startMinute &&
      next.endMinute === active.currentMinutes.endMinute
    ) {
      return;
    }

    const nextStart = dateMinuteToInstant(active.dateKey, next.startMinute, timeZone);
    const nextEnd = dateMinuteToInstant(active.dateKey, next.endMinute, timeZone);
    if (!nextStart || !nextEnd || nextStart.getTime() >= nextEnd.getTime()) return;

    active.currentMinutes = next;
    setResizePreview({ occurrenceKey: active.occurrence.key, interval: next });
  };

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
      suppressedClickKeyRef.current = active.occurrence.key;
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

  const stepAutoScroll = () => {
    const scrollContainer = scrollRef.current;
    const lastPointer = lastPointerRef.current;
    const isMoveActive = moveRef.current?.status === 'dragging';
    const isResizeActive = Boolean(resizeRef.current);

    if (!scrollContainer || !lastPointer || (!isMoveActive && !isResizeActive)) {
      stopAutoScroll();
      return;
    }

    const viewportRect = scrollContainer.getBoundingClientRect();
    const velocity = calculateAutoScrollVelocity(lastPointer.clientY, viewportRect);

    if (velocity === 0) {
      stopAutoScroll();
      return;
    }

    const currentScrollTop = scrollContainer.scrollTop;
    const newScrollTop = clampScrollTop(
      currentScrollTop + velocity,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
    );

    if (newScrollTop === currentScrollTop) {
      stopAutoScroll();
      return;
    }

    scrollContainer.scrollTop = newScrollTop;

    if (isResizeActive && resizeRef.current) {
      applyResizePosition(lastPointer.clientY, newScrollTop);
    } else if (isMoveActive && moveRef.current) {
      applyMovePosition(lastPointer.clientX, lastPointer.clientY, newScrollTop);
    }

    autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
  };

  const checkAndTriggerAutoScroll = () => {
    const scrollContainer = scrollRef.current;
    const lastPointer = lastPointerRef.current;
    const isMoveActive = moveRef.current?.status === 'dragging';
    const isResizeActive = Boolean(resizeRef.current);

    if (!scrollContainer || !lastPointer || (!isMoveActive && !isResizeActive)) {
      stopAutoScroll();
      return;
    }

    const viewportRect = scrollContainer.getBoundingClientRect();
    const velocity = calculateAutoScrollVelocity(lastPointer.clientY, viewportRect);

    if (velocity === 0) {
      stopAutoScroll();
      return;
    }

    const currentScrollTop = scrollContainer.scrollTop;
    const newScrollTop = clampScrollTop(
      currentScrollTop + velocity,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
    );

    if (newScrollTop === currentScrollTop) {
      stopAutoScroll();
      return;
    }

    if (autoScrollRafRef.current === null) {
      autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
    }
  };

  const handleResizePointerDown = (
    e: React.PointerEvent<HTMLSpanElement>,
    occurrence: EventOccurrence,
    dateKey: string,
    edge: ResizeEdge,
    interval: MinuteInterval,
  ) => {
    if (e.button !== 0 || !onResizeEvent) return;
    const column = e.currentTarget.closest<HTMLElement>('[data-date-key]');
    if (!column) return;

    e.preventDefault();
    e.stopPropagation();
    const override = timingOverrides?.get(occurrence.event.id);
    const originalTiming = override ?? { start: occurrence.start, end: occurrence.end };
    const targets = collectMagneticTargets({
      occurrences: byDateKey.get(dateKey) ?? [],
      activeOccurrenceKey: occurrence.key,
      dateKey,
      timeZone,
      workingHours,
    });
    const conflictCandidates = collectConflictCandidates({
      occurrences: byDateKey.get(dateKey) ?? [],
      activeOccurrenceKey: occurrence.key,
      dateKey,
      timeZone,
    });
    resizeRef.current = {
      occurrence,
      dateKey,
      edge,
      originalMinutes: interval,
      currentMinutes: interval,
      originalTiming,
      pointerId: e.pointerId,
      handle: e.currentTarget,
      columnTop: column.getBoundingClientRect().top,
      initialScrollTop: scrollRef.current?.scrollTop ?? 0,
      targets,
      conflictCandidates,
    };
    lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    clearSettle();
    clearExitingGhost();
    suppressedClickKeyRef.current = occurrence.key;
    setResizePreview({ occurrenceKey: occurrence.key, interval });
    setMagneticSnap(null);
    setHasConflict(false);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer capture is best-effort in synthetic/test environments.
    }
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const active = resizeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    const currentScrollTop = scrollRef.current?.scrollTop ?? active.initialScrollTop;
    applyResizePosition(e.clientY, currentScrollTop);
    checkAndTriggerAutoScroll();
  };

  const finishResize = (
    e: React.PointerEvent<HTMLSpanElement> | PointerEvent,
    cancelled: boolean,
  ) => {
    stopAutoScroll();
    const active = resizeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      active.handle.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    resizeRef.current = null;
    lastPointerRef.current = null;
    setResizePreview(null);
    setMagneticSnap(null);
    setHasConflict(false);
    const suppressedKey = active.occurrence.key;
    globalThis.setTimeout(() => {
      if (suppressedClickKeyRef.current === suppressedKey) suppressedClickKeyRef.current = null;
    }, 0);
    if (cancelled) return;

    const nextStart = dateMinuteToInstant(
      active.dateKey,
      active.currentMinutes.startMinute,
      timeZone,
    );
    const nextEnd = dateMinuteToInstant(active.dateKey, active.currentMinutes.endMinute, timeZone);
    if (!nextStart || !nextEnd) return;

    const nextTiming = { start: nextStart.getTime(), end: nextEnd.getTime() };
    if (!hasTimingChanged(active.originalTiming, nextTiming)) return;
    triggerSettle(active.occurrence.key);
    onResizeEvent?.(active.occurrence, nextTiming);
  };

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
    lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    clearExitingGhost();
    setHasConflict(false);
  };

  const handleMovePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const active = moveRef.current;
    if (!active || active.pointerId !== e.pointerId) return;

    lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
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
    lastPointerRef.current = null;
    setMovePreview(null);
    setMagneticSnap(null);
    setHasConflict(false);
    setSnapDirection(null);

    if (!wasDragging) {
      return;
    }

    setExitingGhost({
      occurrence: active.occurrence,
      dateKey: active.originalDateKey,
      originalMinutes: active.originalMinutes,
      originalLayout: active.originalLayout,
    });
    if (ghostExitTimerRef.current) {
      clearTimeout(ghostExitTimerRef.current);
    }
    ghostExitTimerRef.current = setTimeout(() => {
      ghostExitTimerRef.current = null;
      setExitingGhost(null);
    }, GHOST_EXIT_ANIMATION_MS);

    if ('preventDefault' in e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const suppressedKey = occurrenceKey;
    suppressedClickKeyRef.current = suppressedKey;
    globalThis.setTimeout(() => {
      if (suppressedClickKeyRef.current === suppressedKey) suppressedClickKeyRef.current = null;
    }, 0);

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
        lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
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
      lastPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
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
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopAutoScroll();
        lastPointerRef.current = null;
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
          setExitingGhost({
            occurrence: active.occurrence,
            dateKey: active.originalDateKey,
            originalMinutes: active.originalMinutes,
            originalLayout: active.originalLayout,
          });
          if (ghostExitTimerRef.current) {
            clearTimeout(ghostExitTimerRef.current);
          }
          ghostExitTimerRef.current = setTimeout(() => {
            ghostExitTimerRef.current = null;
            setExitingGhost(null);
          }, GHOST_EXIT_ANIMATION_MS);
          const suppressedKey = active.occurrence.key;
          suppressedClickKeyRef.current = suppressedKey;
          globalThis.setTimeout(() => {
            if (suppressedClickKeyRef.current === suppressedKey) {
              suppressedClickKeyRef.current = null;
            }
          }, 0);
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
          suppressedClickKeyRef.current = suppressedKey;
          globalThis.setTimeout(() => {
            if (suppressedClickKeyRef.current === suppressedKey) {
              suppressedClickKeyRef.current = null;
            }
          }, 0);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const scrollKey = `${dateKeys.join('|')}::${hourHeight}::${timeZone}::${todayKey}`;
    if (initialScrollKeyRef.current === scrollKey) return;
    initialScrollKeyRef.current = scrollKey;

    // Runs before the parent opens a linked event's card, so the card measures an on-screen block.
    const initialHour = initialScrollHour({
      dateKeys,
      byDateKey,
      revealEventId,
      todayKey,
      now,
      timeZone,
    });
    scrollRef.current?.scrollTo({ top: initialHour * hourHeight });
  }, [byDateKey, dateKeys, hourHeight, now, revealEventId, timeZone, todayKey]);

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
          <>
            <div className={styles.allDayLabel}>all-day</div>
            <div className={styles.allDayGrid}>
              {dateKeys.map((dateKey) => (
                <div
                  key={dateKey}
                  className={styles.allDayColumn}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest(`.${styles.timelineEvent}`)) return;
                    if (onSelectSlot) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      onSelectSlot({
                        dateKey,
                        allDay: true,
                        anchorRect: {
                          top: rect.top,
                          bottom: rect.bottom,
                          left: rect.left,
                          right: rect.right,
                          width: rect.width,
                          height: rect.height,
                        },
                      });
                    }
                  }}
                >
                  {(allDayByDate.get(dateKey) ?? []).map((occurrence) => (
                    <EventButton
                      key={occurrence.key}
                      occurrence={occurrence}
                      timeZone={timeZone}
                      hourCycle={hourCycle}
                      compact
                      onSelect={(anchorRect) => onSelectEvent(occurrence, anchorRect)}
                    />
                  ))}
                  {draftEvent && draftEvent.dateKey === dateKey && draftEvent.allDay && (
                    <div
                      className={`${styles.timelineEvent} ${styles.timelineEventCompact} ${styles.monthEventDraft} ${
                        draftEvent.isClosing
                          ? styles.monthEventDraftClosing
                          : styles.monthEventDraftEntering
                      }`}
                      style={
                        {
                          '--event-color': draftEvent.calendarColor || 'var(--color-accent)',
                        } as React.CSSProperties
                      }
                    >
                      <span className={styles.timelineEventTitle}>
                        {draftEvent.title || '(New event)'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
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
                    <div
                      data-quick-create-draft="true"
                      className={`${styles.draftTimelineEvent} ${
                        draftEvent.isClosing
                          ? styles.draftTimelineEventBubbleExit
                          : styles.draftTimelineEventBubbleEnter
                      }`}
                      style={
                        {
                          top: (draftEvent.startMinute / 60) * hourHeight,
                          ...(draftPlacement && {
                            left: `calc(${draftPlacement.left * 100}% + 2px)`,
                            width: `calc(${draftPlacement.width * 100}% - 4px)`,
                            right: 'auto',
                          }),
                          height: Math.max(
                            22,
                            ((draftEvent.endMinute - draftEvent.startMinute) / 60) * hourHeight - 2,
                          ),
                          '--event-color': draftEvent.calendarColor || 'var(--color-accent)',
                        } as React.CSSProperties
                      }
                    >
                      <span className={styles.draftTimelineEventTitle}>
                        {draftEvent.title || '(New event)'}
                      </span>
                      <span className={styles.draftTimelineEventTime}>
                        {formatMinute(draftEvent.startMinute, hourCycle)} –{' '}
                        {formatMinute(draftEvent.endMinute, hourCycle)}
                      </span>
                    </div>
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
                      shouldSuppressSelect={() => {
                        if (suppressedClickKeyRef.current !== sourceOccurrence.key) return false;
                        suppressedClickKeyRef.current = null;
                        return true;
                      }}
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
