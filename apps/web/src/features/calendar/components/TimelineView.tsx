import { minuteOfDay, toZonedDateKey } from '@cal/domain';
import type { HourCycle, WorkingHours } from '@cal/schemas';
import { useMemo, useRef } from 'react';

import styles from './CalendarView.module.css';
import { EventButton } from './EventButton';
import { OriginGhost } from './OriginGhost';
import type { AnchorRect } from './QuickCreatePopover';
import { TimelineAllDayRow } from './TimelineAllDayRow';
import { TimelineDraftEvent } from './TimelineDraftEvent';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { useTimelineAutoScroll } from '../hooks/useTimelineAutoScroll';
import { useTimelineGestureFeedback } from '../hooks/useTimelineGestureFeedback';
import { useTimelineGestureRecovery } from '../hooks/useTimelineGestureRecovery';
import { useTimelineInitialScroll } from '../hooks/useTimelineInitialScroll';
import { useTimelineMove } from '../hooks/useTimelineMove';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useTimelineSlotSelection } from '../hooks/useTimelineSlotSelection';
import { dateKeyToInstant } from '../utils/calendar-window';
import { isEventMovable, isEventResizable } from '../utils/event-resize';
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

  // Auto-scroll is called first because both gesture hooks below need its actions, and it
  // needs both gestures back. Its arrows forward to values declared below; they only run
  // after render, so each render's arrow reaches that render's refs and apply functions.
  const { stopAutoScroll, checkAndTriggerAutoScroll, trackPointer, clearPointer } =
    useTimelineAutoScroll(scrollRef, {
      isMoveDragging: () => moveRef.current?.status === 'dragging',
      isResizeActive: () => Boolean(resizeRef.current),
      applyResizeAt: (clientY, scrollTop) => applyResizePosition(clientY, scrollTop),
      applyMoveAt: (clientX, clientY, scrollTop) => applyMovePosition(clientX, clientY, scrollTop),
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

  const {
    moveRef,
    movePreview,
    setMovePreview,
    applyMovePosition,
    handleMovePointerDown,
    handleMovePointerMove,
    handleMovePointerUp,
    handleMovePointerCancel,
    finishMove,
  } = useTimelineMove(scrollRef, {
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
  });

  useTimelineGestureRecovery(scrollRef, {
    resizeRef,
    moveRef,
    setResizePreview,
    setMovePreview,
    applyMovePosition,
    applyResizePosition,
    checkAndTriggerAutoScroll,
    finishMove,
    finishResize,
    setMagneticSnap,
    setHasConflict,
    setSnapDirection,
    showExitingGhost,
    suppressClick,
    releaseSuppressedClickSoon,
    stopAutoScroll,
    trackPointer,
    clearPointer,
  });

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
