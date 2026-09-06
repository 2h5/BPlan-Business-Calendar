import {
  addZonedDays,
  layoutOverlappingEvents,
  MIN_VISUAL_MINUTES,
  minuteOfDay,
  toZonedDateKey,
} from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { useEffect, useMemo, useRef } from 'react';

import styles from './CalendarView.module.css';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { dateKeyToInstant } from '../utils/calendar-window';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

interface TimelineViewProps {
  dateKeys: readonly string[];
  byDateKey: ReadonlyMap<string, EventOccurrence[]>;
  selectedDateKey: string;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onSelectDate: (dateKey: string) => void;
  onSelectEvent: (occurrence: EventOccurrence) => void;
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

interface EventButtonProps {
  occurrence: EventOccurrence;
  timeZone: string;
  hourCycle: HourCycle;
  compact: boolean;
  style?: React.CSSProperties;
  onSelect: () => void;
}

function EventButton({
  occurrence,
  timeZone,
  hourCycle,
  compact,
  style,
  onSelect,
}: EventButtonProps) {
  const color = occurrence.calendar?.color ?? 'var(--color-accent)';
  return (
    <button
      type="button"
      className={`${styles.timelineEvent} ${compact ? styles.timelineEventCompact : ''}`}
      style={{ ...style, '--event-color': color } as React.CSSProperties}
      onClick={onSelect}
      title={`${occurrence.event.title}, ${formatEventTime(occurrence.start, timeZone, hourCycle)}`}
    >
      <span className={styles.timelineEventTitle}>{occurrence.event.title}</span>
      {!compact ? (
        <span className={styles.timelineEventTime}>
          {formatEventTime(occurrence.start, timeZone, hourCycle)}
        </span>
      ) : null}
    </button>
  );
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
}: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isWeek = dateKeys.length > 1;
  const hourHeight = isWeek ? 54 : 64;
  const todayKey = toZonedDateKey(now, timeZone);

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
        className={`${styles.timelineCanvas} ${isWeek ? styles.weekCanvas : styles.dayCanvas}`}
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
                <div key={dateKey} className={styles.allDayColumn}>
                  {(allDayByDate.get(dateKey) ?? []).map((occurrence) => (
                    <EventButton
                      key={occurrence.key}
                      occurrence={occurrence}
                      timeZone={timeZone}
                      hourCycle={hourCycle}
                      compact
                      onSelect={() => onSelectEvent(occurrence)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div className={styles.hourLabels}>
          {HOURS.map((hour) => (
            <span key={hour} style={{ top: hour * hourHeight }}>
              {formatHour(hour, hourCycle)}
            </span>
          ))}
        </div>

        <div className={styles.dayColumns}>
          {dateKeys.map((dateKey) => {
            const dayStart = dateKeyToInstant(dateKey, timeZone);
            const dayEnd = addZonedDays(dayStart, 1, timeZone);
            const timed = (byDateKey.get(dateKey) ?? []).filter((item) => !item.event.allDay);
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
                className={`${styles.dayColumn} ${dateKey === todayKey ? styles.todayColumn : ''}`}
              >
                {HOURS.map((hour) => (
                  <span key={hour} className={styles.hourLine} style={{ top: hour * hourHeight }} />
                ))}
                {laidOut.map((placed) => {
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
                  return (
                    <EventButton
                      key={placed.item.key}
                      occurrence={placed.item}
                      timeZone={timeZone}
                      hourCycle={hourCycle}
                      compact={isWeek || height < 42}
                      style={{
                        top,
                        height,
                        left: `calc(${placed.left * 100}% + 2px)`,
                        width: `calc(${placed.width * 100}% - 4px)`,
                      }}
                      onSelect={() => onSelectEvent(placed.item)}
                    />
                  );
                })}
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
