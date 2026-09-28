import type { HourCycle } from '@cal/schemas';

import styles from '../../components/CalendarView.module.css';
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

/** Below this height (px) the title and time no longer fit on separate lines. */
const TWO_LINE_MIN_HEIGHT = 40;

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
  const height = Math.max(22, ((endMinute - startMinute) / 60) * hourHeight - 2);
  return (
    <div
      data-quick-create-draft="true"
      className={[
        styles.draftTimelineEvent,
        height < TWO_LINE_MIN_HEIGHT && styles.draftTimelineEventShort,
        isClosing ? styles.draftTimelineEventBubbleExit : styles.draftTimelineEventBubbleEnter,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          top: (startMinute / 60) * hourHeight,
          ...(placement && {
            left: `calc(${placement.left * 100}% + 2px)`,
            width: `calc(${placement.width * 100}% - 4px)`,
            right: 'auto',
          }),
          height,
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
