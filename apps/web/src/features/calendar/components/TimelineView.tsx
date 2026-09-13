import {
  addZonedDays,
  layoutOverlappingEvents,
  MIN_VISUAL_MINUTES,
  minuteOfDay,
  toZonedDateKey,
} from '@cal/domain';
import type { HourCycle, WorkingHours } from '@cal/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';

import styles from './CalendarView.module.css';
import type { AnchorRect } from './QuickCreatePopover';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../utils/calendar-window';
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

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const HOLD_DELAY_MS = 180;
const SETTLE_ANIMATION_MS = 180;

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

interface TimelineViewProps {
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
}

function formatHour(hour: number, hourCycle: HourCycle): string {
  if (hourCycle === 'h23') return String(hour).padStart(2, '0');
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

function formatEventTime(instant: number, timeZone: string, hourCycle: HourCycle): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle,
  }).format(new Date(instant));
}

export interface EventButtonProps {
  occurrence: EventOccurrence;
  timeZone: string;
  hourCycle: HourCycle;
  compact: boolean;
  style?: React.CSSProperties;
  onSelect: (anchorRect?: AnchorRect) => void;
  onResizePointerDown?: (event: React.PointerEvent<HTMLSpanElement>, edge: ResizeEdge) => void;
  onResizePointerMove?: (event: React.PointerEvent<HTMLSpanElement>) => void;
  onResizePointerUp?: (event: React.PointerEvent<HTMLSpanElement>) => void;
  onResizePointerCancel?: (event: React.PointerEvent<HTMLSpanElement>) => void;
  onMovePointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMovePointerMove?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMovePointerUp?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMovePointerCancel?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  shouldSuppressSelect?: () => boolean;
  resizePreview?: MinuteInterval;
  movePreview?: MinuteInterval;
  isMovable?: boolean;
  isMagnetized?: boolean;
  hasConflict?: boolean;
  isSettled?: boolean;
}

export function EventButton({
  occurrence,
  timeZone,
  hourCycle,
  compact,
  style,
  onSelect,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
  onResizePointerCancel,
  onMovePointerDown,
  onMovePointerMove,
  onMovePointerUp,
  onMovePointerCancel,
  shouldSuppressSelect,
  resizePreview,
  movePreview,
  isMovable,
  isMagnetized,
  hasConflict,
  isSettled,
}: EventButtonProps) {
  const color = occurrence.calendar?.color ?? 'var(--color-accent)';
  const isResizing = Boolean(resizePreview);
  const isMoving = Boolean(movePreview);
  const isPreviewing = isResizing || isMoving;
  const activeInterval = resizePreview ?? movePreview;
  const currentDuration = activeInterval
    ? activeInterval.endMinute - activeInterval.startMinute
    : 0;
  const isShort = isPreviewing && currentDuration < 45;

  return (
    <button
      type="button"
      className={`${styles.timelineEvent} ${compact ? styles.timelineEventCompact : ''} ${
        isResizing ? styles.timelineEventResizing : ''
      } ${isMoving ? styles.timelineEventMoving : ''} ${
        isShort
          ? isResizing
            ? styles.timelineEventResizingShort
            : styles.timelineEventMovingShort
          : ''
      } ${isMovable && !isPreviewing ? styles.timelineEventMovable : ''} ${
        isMagnetized ? styles.timelineEventMagnetized : ''
      } ${hasConflict ? styles.timelineEventConflicted : ''} ${
        isSettled && !isPreviewing ? styles.timelineEventSettled : ''
      }`}
      style={{ ...style, '--event-color': color } as React.CSSProperties}
      onPointerDown={onMovePointerDown}
      onPointerMove={onMovePointerMove}
      onPointerUp={onMovePointerUp}
      onPointerCancel={onMovePointerCancel}
      onClick={(e) => {
        e.stopPropagation();
        if (shouldSuppressSelect?.()) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onSelect({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        });
      }}
      title={`${occurrence.event.title}, ${formatEventTime(occurrence.start, timeZone, hourCycle)}`}
    >
      {onResizePointerDown ? (
        <span
          className={`${styles.timelineResizeHandle} ${styles.timelineResizeHandleTop}`}
          data-resize-edge="start"
          onPointerDown={(event) => onResizePointerDown(event, 'start')}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerCancel}
        />
      ) : null}
      <span
        className={`${styles.timelineEventTitle} ${
          isPreviewing
            ? isShort
              ? isResizing
                ? styles.timelineEventTitleResizingShort
                : styles.timelineEventTitleMovingShort
              : isResizing
                ? styles.timelineEventTitleResizingNormal
                : styles.timelineEventTitleMovingNormal
            : ''
        }`}
      >
        {occurrence.event.title}
      </span>
      {resizePreview ? (
        <span
          className={`${styles.timelineResizeFeedback} ${
            isShort ? styles.timelineResizeFeedbackShort : styles.timelineResizeFeedbackNormal
          }`}
        >
          <span className={styles.timelineResizeSpan}>
            {formatMinute(resizePreview.startMinute, hourCycle)} –{' '}
            {formatMinute(resizePreview.endMinute, hourCycle)}
          </span>
          <span className={styles.timelineResizeDivider}>·</span>
          <span key={currentDuration} className={styles.timelineResizeDurationBadge}>
            {formatDuration(currentDuration)}
          </span>
          {hasConflict && (
            <>
              <span className={styles.timelineResizeDivider}>·</span>
              <span className={styles.timelineConflictBadge}>Conflict</span>
            </>
          )}
        </span>
      ) : movePreview ? (
        <span
          className={`${styles.timelineMoveFeedback} ${
            isShort ? styles.timelineMoveFeedbackShort : styles.timelineMoveFeedbackNormal
          }`}
        >
          <span className={styles.timelineMoveSpan}>
            {formatMinute(movePreview.startMinute, hourCycle)} –{' '}
            {formatMinute(movePreview.endMinute, hourCycle)}
          </span>
          {hasConflict && (
            <>
              <span className={styles.timelineResizeDivider}>·</span>
              <span className={styles.timelineConflictBadge}>Conflict</span>
            </>
          )}
        </span>
      ) : !compact ? (
        <span className={styles.timelineEventTime}>
          {formatEventTime(occurrence.start, timeZone, hourCycle)}
        </span>
      ) : null}
      {onResizePointerDown ? (
        <span
          className={`${styles.timelineResizeHandle} ${styles.timelineResizeHandleBottom}`}
          data-resize-edge="end"
          onPointerDown={(event) => onResizePointerDown(event, 'end')}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerCancel}
        />
      ) : null}
    </button>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

function formatMinute(minute: number, hourCycle: HourCycle): string {
  if (minute === 24 * 60) return hourCycle === 'h23' ? '24:00' : '12:00 AM';
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  if (hourCycle === 'h23') return `${pad(h)}:${pad(m)}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${pad(m)} ${period}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

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
}: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
    interval: MinuteInterval;
  } | null>(null);
  const [magneticSnap, setMagneticSnap] = useState<{
    dateKey: string;
    minute: number;
    edge: 'start' | 'end';
  } | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [settledOccurrenceKey, setSettledOccurrenceKey] = useState<string | null>(null);

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
    targets: MagneticTarget[];
    conflictCandidates: ConflictCandidate[];
  } | null>(null);

  const moveRef = useRef<{
    status: 'pending' | 'dragging';
    occurrence: EventOccurrence;
    dateKey: string;
    startY: number;
    startX: number;
    originalMinutes: MinuteInterval;
    currentMinutes: MinuteInterval;
    originalTiming: EventTiming;
    pointerId: number;
    button: HTMLButtonElement;
    columnTop: number;
    targets: MagneticTarget[];
    conflictCandidates: ConflictCandidate[];
  } | null>(null);
  const suppressedClickKeyRef = useRef<string | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
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
      targets,
      conflictCandidates,
    };
    clearSettle();
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

    const rawMinute = ((e.clientY - active.columnTop) / hourHeight) * 60;
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

  const finishResize = (e: React.PointerEvent<HTMLSpanElement>, cancelled: boolean) => {
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
  ) => {
    if (e.button !== 0 || !onMoveEvent) return;
    if ((e.target as HTMLElement).closest('[data-resize-edge]')) return;
    const column = e.currentTarget.closest<HTMLElement>('[data-date-key]');
    if (!column) return;

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

    moveRef.current = {
      status: 'pending',
      occurrence,
      dateKey,
      startY: e.clientY,
      startX: e.clientX,
      originalMinutes: interval,
      currentMinutes: interval,
      originalTiming,
      pointerId: e.pointerId,
      button: e.currentTarget,
      columnTop: column.getBoundingClientRect().top,
      targets,
      conflictCandidates,
    };
    setHasConflict(false);
  };

  const handleMovePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const active = moveRef.current;
    if (!active || active.pointerId !== e.pointerId) return;

    const resolution = resolveMoveGesture({
      startY: active.startY,
      startX: active.startX,
      currentY: e.clientY,
      currentX: e.clientX,
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
        active.button.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is best-effort in synthetic/test environments.
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const targetMinutes =
      resolution.type === 'noop' ? active.originalMinutes : resolution.nextMinutes;

    if (resolution.snap) {
      setMagneticSnap({
        dateKey: active.dateKey,
        minute: resolution.snap.snappedMinute,
        edge: resolution.snap.edge,
      });
    } else {
      setMagneticSnap(null);
    }

    const conflicting = checkHasConflict(targetMinutes, active.conflictCandidates);
    setHasConflict(conflicting);

    if (
      targetMinutes.startMinute === active.currentMinutes.startMinute &&
      targetMinutes.endMinute === active.currentMinutes.endMinute
    ) {
      return;
    }

    const nextStart = dateMinuteToInstant(active.dateKey, targetMinutes.startMinute, timeZone);
    const nextEnd = dateMinuteToInstant(active.dateKey, targetMinutes.endMinute, timeZone);
    if (!nextStart || !nextEnd || nextStart.getTime() >= nextEnd.getTime()) return;

    active.currentMinutes = targetMinutes;
    setMovePreview({ occurrenceKey: active.occurrence.key, interval: targetMinutes });
  };

  const finishMove = (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const active = moveRef.current;
    if (!active || active.pointerId !== e.pointerId) return;

    try {
      active.button.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const wasDragging = active.status === 'dragging';
    moveRef.current = null;
    setMovePreview(null);
    setMagneticSnap(null);
    setHasConflict(false);

    if (!wasDragging) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const suppressedKey = active.occurrence.key;
    suppressedClickKeyRef.current = suppressedKey;
    globalThis.setTimeout(() => {
      if (suppressedClickKeyRef.current === suppressedKey) suppressedClickKeyRef.current = null;
    }, 0);

    if (cancelled) return;

    const resolution = resolveMoveGesture({
      startY: active.startY,
      startX: active.startX,
      currentY: e.clientY,
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

    if (resolution.type !== 'move') return;

    const nextStart = dateMinuteToInstant(
      active.dateKey,
      resolution.nextMinutes.startMinute,
      timeZone,
    );
    const nextEnd = dateMinuteToInstant(active.dateKey, resolution.nextMinutes.endMinute, timeZone);
    if (!nextStart || !nextEnd) return;

    const nextTiming = { start: nextStart.getTime(), end: nextEnd.getTime() };
    if (!hasTimingChanged(active.originalTiming, nextTiming)) return;
    triggerSettle(active.occurrence.key);
    onMoveEvent?.(active.occurrence, nextTiming);
  };

  const handleMovePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => finishMove(e, false);
  const handleMovePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => finishMove(e, true);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
    const initialHour =
      todayKey && dateKeys.includes(todayKey)
        ? Math.max(0, minuteOfDay(now, timeZone) / 60 - 2)
        : 7;
    scrollRef.current?.scrollTo({ top: initialHour * hourHeight });
  }, [dateKeys, hourHeight, now, timeZone, todayKey]);

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

  return (
    <div className={styles.timelineViewport} ref={scrollRef}>
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
            const dayStart = dateKeyToInstant(dateKey, timeZone);
            const dayEnd = addZonedDays(dayStart, 1, timeZone);
            const timed = (byDateKey.get(dateKey) ?? [])
              .filter((item) => !item.event.allDay)
              .map((item) => {
                const optimistic = timingOverrides?.get(item.event.id);
                const activeResize =
                  resizePreview?.occurrenceKey === item.key ? resizeRef.current : null;
                const activeMove = movePreview?.occurrenceKey === item.key ? moveRef.current : null;
                if (activeResize) {
                  const start = dateMinuteToInstant(
                    dateKey,
                    activeResize.currentMinutes.startMinute,
                    timeZone,
                  );
                  const end = dateMinuteToInstant(
                    dateKey,
                    activeResize.currentMinutes.endMinute,
                    timeZone,
                  );
                  if (start && end) return { ...item, start: start.getTime(), end: end.getTime() };
                }
                if (activeMove && activeMove.status === 'dragging') {
                  const start = dateMinuteToInstant(
                    dateKey,
                    activeMove.currentMinutes.startMinute,
                    timeZone,
                  );
                  const end = dateMinuteToInstant(
                    dateKey,
                    activeMove.currentMinutes.endMinute,
                    timeZone,
                  );
                  if (start && end) return { ...item, start: start.getTime(), end: end.getTime() };
                }
                return optimistic ? { ...item, ...optimistic } : item;
              });
            const laidOut = layoutOverlappingEvents(timed, (item) => ({
              start: Math.max(item.start, dayStart.getTime()),
              end: Math.max(
                Math.min(item.end, dayEnd.getTime()),
                Math.max(item.start, dayStart.getTime()) + MIN_VISUAL_MINUTES * 60_000,
              ),
            }));
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
                      className={`${styles.draftTimelineEvent} ${
                        draftEvent.isClosing
                          ? styles.draftTimelineEventBubbleExit
                          : styles.draftTimelineEventBubbleEnter
                      }`}
                      style={
                        {
                          top: (draftEvent.startMinute / 60) * hourHeight,
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
                {laidOut.map((placed) => {
                  const sourceOccurrence =
                    (byDateKey.get(dateKey) ?? []).find(
                      (occurrence) => occurrence.key === placed.item.key,
                    ) ?? placed.item;
                  const startMinute =
                    placed.interval.start <= dayStart.getTime()
                      ? 0
                      : minuteOfDay(new Date(placed.interval.start), timeZone);
                  const endMinute =
                    placed.interval.end >= dayEnd.getTime()
                      ? 24 * 60
                      : minuteOfDay(new Date(placed.interval.end), timeZone);
                  const top = (startMinute / 60) * hourHeight;
                  const height = Math.max(
                    ((endMinute - startMinute) / 60) * hourHeight - 2,
                    isWeek ? 20 : 24,
                  );
                  const canResize =
                    Boolean(onResizeEvent) && isEventResizable(sourceOccurrence, dateKey, timeZone);
                  const canMove =
                    Boolean(onMoveEvent) && isEventMovable(sourceOccurrence, dateKey, timeZone);
                  const activeResize =
                    resizePreview?.occurrenceKey === placed.item.key
                      ? resizePreview.interval
                      : undefined;
                  const activeMove =
                    movePreview?.occurrenceKey === placed.item.key
                      ? movePreview.interval
                      : undefined;
                  return (
                    <EventButton
                      key={placed.item.key}
                      occurrence={placed.item}
                      timeZone={timeZone}
                      hourCycle={hourCycle}
                      compact={(isWeek || height < 42) && !activeResize && !activeMove}
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
                              handleMovePointerDown(event, sourceOccurrence, dateKey, {
                                startMinute,
                                endMinute,
                              })
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
                      resizePreview={activeResize}
                      movePreview={activeMove}
                      isMovable={canMove}
                      isMagnetized={Boolean(
                        magneticSnap &&
                        (resizePreview?.occurrenceKey === placed.item.key ||
                          movePreview?.occurrenceKey === placed.item.key),
                      )}
                      hasConflict={Boolean(
                        hasConflict &&
                        (resizePreview?.occurrenceKey === placed.item.key ||
                          movePreview?.occurrenceKey === placed.item.key),
                      )}
                      isSettled={settledOccurrenceKey === placed.item.key}
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
