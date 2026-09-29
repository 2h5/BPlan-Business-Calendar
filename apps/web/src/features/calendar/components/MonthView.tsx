import { resolveEventColor, toZonedDateKey } from '@cal/domain';
import { useRef, type MouseEvent } from 'react';

import styles from './CalendarView.module.css';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import type { DraftEventState, SlotSelection } from '../types';
import { dateKeyToInstant } from '../utils/calendar-window';
import type { AnchorRect } from '../utils/popover-position';

/** Generous upper bound on the OS double-click interval. */
const DOUBLE_CLICK_MS = 600;

interface EmptyDayClick {
  dateKey: string;
  empty: boolean;
  at: number;
}

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
  const recentClicks = useRef<EmptyDayClick[]>([]);

  // The browser fires dblclick for any two quick clicks close together, even
  // when the first landed on an event chip or closed its card. Only zoom in
  // when both clicks were on empty space in this same day.
  const recordClick = (dateKey: string, e: MouseEvent<HTMLElement>) => {
    const empty = !(e.target as HTMLElement).closest(`.${styles.monthEvent}`);
    recentClicks.current = [...recentClicks.current.slice(-1), { dateKey, empty, at: e.timeStamp }];
  };
  const isEmptyDoubleClick = (dateKey: string, e: MouseEvent<HTMLElement>) => {
    const clicks = recentClicks.current;
    return (
      clicks.length === 2 &&
      clicks.every((click) => click.empty && click.dateKey === dateKey) &&
      e.timeStamp - (clicks[0]?.at ?? 0) <= DOUBLE_CLICK_MS
    );
  };

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
                onClickCapture={(e) => recordClick(dateKey, e)}
                onDoubleClick={(e) => {
                  if (isEmptyDoubleClick(dateKey, e)) onSelectDate(dateKey);
                }}
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
                          '--event-color': resolveEventColor(
                            occurrence.event.color,
                            occurrence.calendar?.color,
                            'var(--color-accent)',
                          ),
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
                      className={`${styles.monthEvent} ${styles.monthEventDraft} ${
                        draftEvent.isClosing
                          ? styles.monthEventDraftClosing
                          : styles.monthEventDraftEntering
                      }`}
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
