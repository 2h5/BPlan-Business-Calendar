import { toZonedDateKey } from '@cal/domain';

import styles from './CalendarView.module.css';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../utils/calendar-window';

interface MonthViewProps {
  dateKeys: readonly string[];
  byDateKey: ReadonlyMap<string, EventOccurrence[]>;
  selectedDateKey: string;
  timeZone: string;
  now: Date;
  onSelectDate: (dateKey: string) => void;
  onSelectEvent: (occurrence: EventOccurrence) => void;
}

export function MonthView({
  dateKeys,
  byDateKey,
  selectedDateKey,
  timeZone,
  now,
  onSelectDate,
  onSelectEvent,
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
                className={`${styles.monthDay} ${isOutside ? styles.monthDayOutside : ''} ${dateKey === selectedDateKey ? styles.monthDaySelected : ''}`}
              >
                <button
                  type="button"
                  className={`${styles.monthDateButton} ${isToday ? styles.monthDateToday : ''}`}
                  onClick={() => onSelectDate(dateKey)}
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
                      onClick={() => onSelectEvent(occurrence)}
                      title={occurrence.event.title}
                    >
                      <span />
                      {occurrence.event.title}
                    </button>
                  ))}
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
