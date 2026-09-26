import { resolveEventColor } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';

import styles from './CalendarView.module.css';
import type { AnchorRect } from './QuickCreatePopover';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import type { MinuteInterval, ResizeEdge } from '../utils/event-resize';
import { formatDuration, formatEventTime, formatMinute } from '../utils/timeline-format';

export interface EventButtonProps {
  occurrence: EventOccurrence;
  timeZone: string;
  hourCycle: HourCycle;
  compact: boolean;
  /** Time range and duration, shown at rest the way resizing shows them. */
  showDetails?: boolean;
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
  snapDirection?: 'left' | 'right' | null;
}

/**
 * One event block on the timeline grid (and in the all-day row). Purely
 * presentational: gesture state arrives as preview/feedback props and pointer
 * input is forwarded to the handlers `TimelineView` wires up.
 */
export function EventButton({
  occurrence,
  timeZone,
  hourCycle,
  compact,
  showDetails = false,
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
  snapDirection,
}: EventButtonProps) {
  const color = resolveEventColor(
    occurrence.event.color,
    occurrence.calendar?.color,
    'var(--color-accent)',
  );
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
      data-event-id={occurrence.event.id}
      data-occurrence-key={occurrence.key}
      className={`${styles.timelineEvent} ${compact ? styles.timelineEventCompact : ''} ${
        showDetails && !isPreviewing ? styles.timelineEventWithDetails : ''
      } ${
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
      } ${
        snapDirection === 'left'
          ? styles.timelineEventSnapRight
          : snapDirection === 'right'
            ? styles.timelineEventSnapLeft
            : ''
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
      ) : showDetails ? (
        <span
          className={`${styles.timelineResizeFeedback} ${styles.timelineResizeFeedbackNormal} ${styles.timelineEventDetails}`}
        >
          <span className={styles.timelineResizeSpan}>
            {formatEventTime(occurrence.start, timeZone, hourCycle)} –{' '}
            {formatEventTime(occurrence.end, timeZone, hourCycle)}
          </span>
          <span className={styles.timelineResizeDivider}>·</span>
          <span className={styles.timelineResizeDurationBadge}>
            {formatDuration(Math.round((occurrence.end - occurrence.start) / 60_000))}
          </span>
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
