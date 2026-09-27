import type { HourCycle } from '@cal/schemas';

import { EventButton } from './EventButton';
import { TimelineAllDayDraft } from './TimelineDraftEvent';
import styles from '../../components/CalendarView.module.css';
import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import type { DraftEventState, SlotSelection } from '../../types';
import type { AnchorRect } from '../../utils/popover-position';

export interface TimelineAllDayRowProps {
  dateKeys: readonly string[];
  /** All-day occurrences for each visible day. */
  allDayByDate: ReadonlyMap<string, EventOccurrence[]>;
  timeZone: string;
  hourCycle: HourCycle;
  draftEvent?: DraftEventState | null;
  onSelectEvent: (occurrence: EventOccurrence, anchorRect?: AnchorRect) => void;
  onSelectSlot?: (selection: SlotSelection) => void;
}

/**
 * The all-day label and grid: one column per day with its all-day events and
 * the all-day draft. Clicking empty space in a column selects an all-day slot.
 */
export function TimelineAllDayRow({
  dateKeys,
  allDayByDate,
  timeZone,
  hourCycle,
  draftEvent,
  onSelectEvent,
  onSelectSlot,
}: TimelineAllDayRowProps) {
  return (
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
              <TimelineAllDayDraft
                title={draftEvent.title}
                calendarColor={draftEvent.calendarColor}
                isClosing={draftEvent.isClosing}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
