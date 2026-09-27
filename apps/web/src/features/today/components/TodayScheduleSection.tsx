import { formatDuration, formatTimeOfDay, resolveEventColor } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';

import { CalendarEmptyIcon } from './TodayIcons';
import styles from './TodayView.module.css';
import type { EventOccurrence } from '../../calendar/utils/calendar-occurrences';

export interface TodayScheduleSectionProps {
  headingId: string;
  allDay: readonly EventOccurrence[];
  timed: readonly EventOccurrence[];
  now: Date;
  timeZone: string;
  hourCycle: HourCycle;
  onOpenCalendar: () => void;
  onCreateEvent: () => void;
  onOpenEvent: (eventId: string) => void;
}

export function TodayScheduleSection({
  headingId,
  allDay,
  timed,
  now,
  timeZone,
  hourCycle,
  onOpenCalendar,
  onCreateEvent,
  onOpenEvent,
}: TodayScheduleSectionProps) {
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitleRow}>
          <h2 id={headingId} className={styles.sectionHeading}>
            Schedule
          </h2>
          <span className={styles.countBadge}>{allDay.length + timed.length}</span>
        </div>
        <button type="button" className={styles.textNavButton} onClick={onOpenCalendar}>
          Full calendar →
        </button>
      </div>

      {/* All-Day Events */}
      {allDay.length > 0 && (
        <div className={styles.allDayBlock}>
          <span className={styles.allDayLabel}>All-Day</span>
          <div className={styles.allDayList}>
            {allDay.map((item) => (
              <button
                key={item.key}
                type="button"
                className={styles.allDayPill}
                onClick={() => onOpenEvent(item.event.id)}
              >
                <span
                  className={styles.allDayDot}
                  style={{
                    backgroundColor: resolveEventColor(
                      item.event.color,
                      item.calendar?.color,
                      'var(--color-accent)',
                    ),
                  }}
                />
                <span className={styles.allDayTitle}>{item.event.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Timeline */}
      {timed.length === 0 ? (
        <div className={styles.emptySchedule}>
          <CalendarEmptyIcon />
          <h3>Your schedule is clear</h3>
          <p>No timed commitments today. Enjoy uninterrupted focus time.</p>
          <button type="button" className={styles.secondaryActionButton} onClick={onCreateEvent}>
            + Schedule Event
          </button>
        </div>
      ) : (
        <div className={styles.timeline}>
          {timed.map((item) => {
            const nowMs = now.getTime();
            const isCurrent = nowMs >= item.start && nowMs < item.end;
            const isPast = nowMs >= item.end;
            const durationMins = Math.round((item.end - item.start) / 60000);
            const color = resolveEventColor(
              item.event.color,
              item.calendar?.color,
              'var(--color-accent)',
            );
            const startTimeStr = formatTimeOfDay(new Date(item.start), timeZone, hourCycle);
            const endTimeStr = formatTimeOfDay(new Date(item.end), timeZone, hourCycle);

            return (
              <div
                key={item.key}
                className={`${styles.timelineEntry} ${isCurrent ? styles.timelineCurrent : ''} ${
                  isPast ? styles.timelinePast : ''
                }`}
              >
                <div className={styles.timelineTimeCol}>
                  <time className={styles.timelineTime}>{isCurrent ? 'Now' : startTimeStr}</time>
                  <span className={styles.timelineDuration}>{formatDuration(durationMins)}</span>
                </div>

                <div className={styles.timelineSpine}>
                  <div
                    className={styles.timelineNode}
                    style={{
                      borderColor: color,
                      backgroundColor: isCurrent ? color : undefined,
                    }}
                  />
                  <div className={styles.timelineLine} />
                </div>

                <button
                  type="button"
                  className={styles.eventCard}
                  onClick={() => onOpenEvent(item.event.id)}
                >
                  <div className={styles.eventCardColorBar} style={{ backgroundColor: color }} />
                  <div className={styles.eventCardContent}>
                    <div className={styles.eventCardTop}>
                      <strong className={styles.eventCardTitle}>{item.event.title}</strong>
                    </div>
                    <div className={styles.eventCardMeta}>
                      <span className={styles.eventCardRange}>
                        {startTimeStr} – {endTimeStr}
                      </span>
                      <span className={styles.eventCalendarTag}>
                        {item.calendar?.name ?? 'Calendar'}
                      </span>
                      {item.event.location && (
                        <span className={styles.eventLocationTag}>📍 {item.event.location}</span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
