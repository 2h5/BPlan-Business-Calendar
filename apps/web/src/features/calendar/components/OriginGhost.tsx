import { resolveEventColor } from '@cal/domain';

import styles from './CalendarView.module.css';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import type { MinuteInterval } from '../utils/event-resize';

export interface OriginGhostProps {
  occurrence: EventOccurrence;
  originalMinutes: MinuteInterval;
  originalLayout: { left: number; width: number };
  hourHeight: number;
  isWeek: boolean;
  isExiting?: boolean;
}

/** Dashed placeholder left at an event's original slot while it is dragged, and briefly after drop. */
export function OriginGhost({
  occurrence,
  originalMinutes,
  originalLayout,
  hourHeight,
  isWeek,
  isExiting,
}: OriginGhostProps) {
  const color = resolveEventColor(
    occurrence.event.color,
    occurrence.calendar?.color,
    'var(--color-accent)',
  );
  return (
    <div
      data-testid="timeline-origin-ghost"
      data-origin-ghost="true"
      data-event-id={occurrence.event.id}
      data-occurrence-key={occurrence.key}
      data-exiting={isExiting ? 'true' : undefined}
      className={`${styles.timelineEventGhost} ${isExiting ? styles.timelineEventGhostExiting : ''}`}
      style={
        {
          top: (originalMinutes.startMinute / 60) * hourHeight,
          height: Math.max(
            ((originalMinutes.endMinute - originalMinutes.startMinute) / 60) * hourHeight - 2,
            isWeek ? 20 : 24,
          ),
          left: `calc(${originalLayout.left * 100}% + 2px)`,
          width: `calc(${originalLayout.width * 100}% - 4px)`,
          '--event-color': color,
        } as React.CSSProperties
      }
      aria-hidden="true"
    />
  );
}
