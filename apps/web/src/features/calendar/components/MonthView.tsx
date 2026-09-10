import { toZonedDateKey } from '@cal/domain';

import styles from './CalendarView.module.css';
import type { AnchorRect } from './QuickCreatePopover';
import type { DraftEventState, SlotSelection } from './TimelineView';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../utils/calendar-window';

interface MonthViewProps {
  dateKeys: readonly string[];
  byDateKey: ReadonlyMap<string, EventOccurrence[]>;
  selectedDateKey: string;
  timeZone: string;
  now: Date;
  onSelectDate: (dateKey: string) => void;
  onSelectEvent: (occurrence: EventOccurrence, anchorRect?: AnchorRect) => void;
  onSelectSlot?: (selection: SlotSelection) => void;
  draftEvent?: DraftEventState | null;
}

export function MonthView({
  dateKeys,
  byDateKey,
  selectedDateKey,
  timeZone,
  now,
  onSelectDate,
  onSelectEvent,
  onSelectSlot,
  draftEvent,
}: MonthViewProps) {
  const focusedMonth = Number(selectedDateKey.slice(5, 7));
  const todayKey = toZonedDateKey(now, timeZone);
  const weekdayKeys = dateKeys.slice(0, 7);

  return (
    <div className={styles.monthViewport}>
      <div className={styles.monthGrid}>
        <div className={styles.monthWeekdays}>
          {weekdayKeys.map((dateKey) => (
            <span key={dateKey}>
              {new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
                dateKeyToInstant(dateKey, timeZone),
              )}
            </span>
          ))}
        </div>
        <div className={styles.monthDays}>
          {dateKeys.map((dateKey) => {
            const events = byDateKey.get(dateKey) ?? [];
            const isOutside = Number(dateKey.slice(5, 7)) !== focusedMonth;
            const isToday = dateKey === todayKey;
            return (
              <div
                key={dateKey}
                data-date-key={dateKey}
                className={`${styles.monthDay} ${isOutside ? styles.monthDayOutside : ''} ${dateKey === selectedDateKey ? styles.monthDaySelected : ''}`}
                onDoubleClick={() => onSelectDate(dateKey)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest(`.${styles.monthEvent}`)) {
                    return;
                  }
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
                <button
                  type="button"
                  className={`${styles.monthDateButton} ${isToday ? styles.monthDateToday : ''}`}
                  aria-label={`${dateKey}, ${events.length} events`}
                >
                  {Number(dateKey.slice(-2))}
                </button>
                <div className={styles.monthEvents}>
                  {events.slice(0, 3).map((occurrence) => (
                    <button
                      key={occurrence.key}
                      type="button"
                      className={styles.monthEvent}
                      style={
                        {
                          '--event-color': occurrence.calendar?.color ?? 'var(--color-accent)',
                        } as React.CSSProperties
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        onSelectEvent(occurrence, {
                          top: rect.top,
                          bottom: rect.bottom,
                          left: rect.left,
                          right: rect.right,
                          width: rect.width,
                          height: rect.height,
                        });
                      }}
                      title={occurrence.event.title}
                    >
                      <span />
                      {occurrence.event.title}
                    </button>
                  ))}
                  {draftEvent && draftEvent.dateKey === dateKey && (
                    <div
                      className={`${styles.monthEvent} ${styles.monthEventDraft}`}
                      style={
                        {
                          '--event-color': draftEvent.calendarColor ?? 'var(--color-accent)',
                        } as React.CSSProperties
                      }
                      title={draftEvent.title || '(New event)'}
                    >
                      <span />
                      {draftEvent.title || '(New event)'}
                    </div>
                  )}
                  {events.length > 3 ? (
                    <span className={styles.moreEvents}>+{events.length - 3} more</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
