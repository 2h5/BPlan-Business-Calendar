import type { WorkingHours } from '@cal/schemas';
import { useRef, useState, type RefObject } from 'react';

import type { EventOccurrence } from './useCalendarWindow';
import type { TimelineAutoScroll } from './useTimelineAutoScroll';
import type { TimelineGestureFeedback } from './useTimelineGestureFeedback';
import type { EventTiming } from '../components/TimelineView';
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
  resolveMoveGesture,
  type MinuteInterval,
} from '../utils/event-resize';

export interface TimelineActiveMove {
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
}

export interface TimelineMovePreview {
  occurrenceKey: string;
  dateKey: string;
  interval: MinuteInterval;
}

export interface UseTimelineMoveOptions
  extends
    Pick<
      TimelineGestureFeedback,
      | 'setMagneticSnap'
      | 'setHasConflict'
      | 'setSnapDirection'
      | 'clearSettle'
      | 'clearExitingGhost'
      | 'showExitingGhost'
      | 'suppressClick'
      | 'releaseSuppressedClickSoon'
      | 'triggerSettle'
    >,
    TimelineAutoScroll {
  dateKeys: readonly string[];
  selectedDateKey: string;
  hourHeight: number;
  timeZone: string;
  byDateKey: ReadonlyMap<string, EventOccurrence[]>;
  workingHours?: WorkingHours;
  timingOverrides?: ReadonlyMap<string, EventTiming>;
  onMoveEvent?: (occurrence: EventOccurrence, timing: EventTiming) => void;
}

/**
 * The timeline's move gesture: the active move, its preview, the target-day
 * helpers, the event pointer handlers and the commit. A press arms a
 * `pending` move that `resolveMoveGesture` promotes to `dragging`. Feedback
 * and auto-scroll actions come in from the calling render, so each handler
 * uses the same render's copies as before. `moveRef` and `setMovePreview`
 * are returned for the window fallback, Escape and the per-day layout, which
 * still live in `TimelineView`.
 */
export function useTimelineMove(
  scrollRef: RefObject<HTMLDivElement | null>,
  {
    dateKeys,
    selectedDateKey,
    hourHeight,
    timeZone,
    byDateKey,
    workingHours,
    timingOverrides,
    onMoveEvent,
    setMagneticSnap,
    setHasConflict,
    setSnapDirection,
    clearSettle,
    clearExitingGhost,
    showExitingGhost,
    suppressClick,
    releaseSuppressedClickSoon,
    triggerSettle,
    stopAutoScroll,
    checkAndTriggerAutoScroll,
    trackPointer,
    clearPointer,
  }: UseTimelineMoveOptions,
) {
  const [movePreview, setMovePreview] = useState<TimelineMovePreview | null>(null);
  const moveRef = useRef<TimelineActiveMove | null>(null);
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

  return {
    moveRef,
    movePreview,
    setMovePreview,
    applyMovePosition,
    handleMovePointerDown,
    handleMovePointerMove,
    handleMovePointerUp,
    handleMovePointerCancel,
    finishMove,
  };
}
