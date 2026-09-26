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
  snapResizeInterval,
  type MagneticTarget,
} from '../utils/event-magnetic-snap';
import {
  dateMinuteToInstant,
  hasTimingChanged,
  type MinuteInterval,
  type ResizeEdge,
} from '../utils/event-resize';

export interface TimelineActiveResize {
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
}

export interface TimelineResizePreview {
  occurrenceKey: string;
  interval: MinuteInterval;
}

export interface UseTimelineResizeOptions
  extends
    Pick<
      TimelineGestureFeedback,
      | 'setMagneticSnap'
      | 'setHasConflict'
      | 'clearSettle'
      | 'clearExitingGhost'
      | 'suppressClick'
      | 'releaseSuppressedClickSoon'
      | 'triggerSettle'
    >,
    TimelineAutoScroll {
  hourHeight: number;
  timeZone: string;
  byDateKey: ReadonlyMap<string, EventOccurrence[]>;
  workingHours?: WorkingHours;
  timingOverrides?: ReadonlyMap<string, EventTiming>;
  onResizeEvent?: (occurrence: EventOccurrence, timing: EventTiming) => void;
}

/**
 * The timeline's resize gesture: the active resize, its preview, the handle
 * pointer handlers and the commit. Feedback and auto-scroll actions come in
 * from the calling render, so each handler uses the same render's copies as
 * before. `resizeRef` is returned for the window fallback, Escape and the
 * per-day layout snapshot, which still live in `TimelineView`.
 */
export function useTimelineResize(
  scrollRef: RefObject<HTMLDivElement | null>,
  {
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
  }: UseTimelineResizeOptions,
) {
  const [resizePreview, setResizePreview] = useState<TimelineResizePreview | null>(null);
  const resizeRef = useRef<TimelineActiveResize | null>(null);

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
    trackPointer(e.clientX, e.clientY);
    clearSettle();
    clearExitingGhost();
    suppressClick(occurrence.key);
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

    trackPointer(e.clientX, e.clientY);
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
    clearPointer();
    setResizePreview(null);
    setMagneticSnap(null);
    setHasConflict(false);
    const suppressedKey = active.occurrence.key;
    releaseSuppressedClickSoon(suppressedKey);
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

  return {
    resizeRef,
    resizePreview,
    setResizePreview,
    applyResizePosition,
    handleResizePointerDown,
    handleResizePointerMove,
    finishResize,
  };
}
