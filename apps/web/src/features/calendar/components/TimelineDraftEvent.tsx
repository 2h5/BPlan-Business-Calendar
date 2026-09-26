import type { HourCycle } from '@cal/schemas';

import styles from './CalendarView.module.css';
import { formatMinute } from '../utils/timeline-format';

interface DraftAppearance {
  title?: string;
  calendarColor?: string;
  isClosing?: boolean;
}

export interface TimelineDraftEventProps extends DraftAppearance {
  startMinute: number;
  endMinute: number;
  /** Column the draft takes in the day layout (`layoutTimelineDay`'s `draftPlacement`). */
  placement?: { left: number; width: number };
  hourHeight: number;
  hourCycle: HourCycle;
}

/** The unsaved quick-create draft as a timed block in a day column. */
export function TimelineDraftEvent({
  startMinute,
  endMinute,
  placement,
  hourHeight,
  hourCycle,
  title,
  calendarColor,
  isClosing,
}: TimelineDraftEventProps) {
  return (
    <div
      data-quick-create-draft="true"
      className={`${styles.draftTimelineEvent} ${
        isClosing ? styles.draftTimelineEventBubbleExit : styles.draftTimelineEventBubbleEnter
      }`}
      style={
        {
          top: (startMinute / 60) * hourHeight,
          ...(placement && {
            left: `calc(${placement.left * 100}% + 2px)`,
            width: `calc(${placement.width * 100}% - 4px)`,
            right: 'auto',
          }),
          height: Math.max(22, ((endMinute - startMinute) / 60) * hourHeight - 2),
          '--event-color': calendarColor || 'var(--color-accent)',
        } as React.CSSProperties
      }
    >
      <span className={styles.draftTimelineEventTitle}>{title || '(New event)'}</span>
      <span className={styles.draftTimelineEventTime}>
        {formatMinute(startMinute, hourCycle)} – {formatMinute(endMinute, hourCycle)}
      </span>
    </div>
  );
}

export type TimelineAllDayDraftProps = DraftAppearance;

/** The unsaved quick-create draft as a chip in the all-day row. */
export function TimelineAllDayDraft({ title, calendarColor, isClosing }: TimelineAllDayDraftProps) {
  return (
    <div
      className={`${styles.timelineEvent} ${styles.timelineEventCompact} ${styles.monthEventDraft} ${
        isClosing ? styles.monthEventDraftClosing : styles.monthEventDraftEntering
      }`}
      style={
        {
          '--event-color': calendarColor || 'var(--color-accent)',
        } as React.CSSProperties
      }
    >
      <span className={styles.timelineEventTitle}>{title || '(New event)'}</span>
    </div>
  );
}
