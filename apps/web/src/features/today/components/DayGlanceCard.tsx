import { formatTimeOfDay, resolveEventColor } from '@cal/domain';
import { useMemo } from 'react';

import { DayBar } from './DayBar';
import styles from './DayGlanceCard.module.css';
import type { useToday } from '../hooks/useToday';
import { buildDayBar, type DayBarSegment } from '../utils/day-bar';
import { describeDayGlance } from '../utils/day-glance';

const ACCENT = 'var(--color-accent)';

export interface DayGlanceCardProps {
  today: ReturnType<typeof useToday>;
  onOpenEvent: (eventId: string) => void;
}

/**
 * The top of Today on the web: what is on now or next, how much free time is
 * left, and the shape of the day — mirroring mobile's Up Next card.
 *
 * The outline and eyebrow answer "am I free right now?" before anything is
 * read: green when nothing is running, red while an event is.
 */
export function DayGlanceCard({ today, onOpenEvent }: DayGlanceCardProps) {
  const { now, timeZone, hourCycle, timed, allDay, freeTime } = today;

  const glance = describeDayGlance({
    now,
    timeZone,
    hourCycle,
    timed,
    allDay,
    freeTime,
    workdayEndsAt: today.workdayEndsAt,
  });

  const dayBar = useMemo(
    () =>
      buildDayBar({
        dayStart: today.dayStart,
        dayEnd: today.dayEnd,
        now,
        timeZone,
        workdayStartsAt: today.workdayStartsAt,
        workdayEndsAt: today.workdayEndsAt,
        busy: timed.map((item) => ({
          key: item.key,
          start: item.start,
          end: item.end,
          color: resolveEventColor(item.event.color, item.calendar?.color, ACCENT),
        })),
        free: freeTime.intervals,
      }),
    [
      freeTime.intervals,
      now,
      timeZone,
      timed,
      today.dayEnd,
      today.dayStart,
      today.workdayEndsAt,
      today.workdayStartsAt,
    ],
  );

  const time = (ms: number) => formatTimeOfDay(new Date(ms), timeZone, hourCycle);
  const occurrenceByKey = new Map(timed.map((item) => [item.key, item]));

  const describeSegment = (segment: DayBarSegment): string => {
    if (segment.kind === 'free') {
      const interval = freeTime.intervals[Number(segment.key.slice('free:'.length))];
      return interval ? `Free · ${time(interval.start)} – ${time(interval.end)}` : 'Free';
    }
    const item = occurrenceByKey.get(segment.key);
    return item ? `${item.event.title} · ${time(item.start)} – ${time(item.end)}` : 'Busy';
  };

  const openSegment = (segment: DayBarSegment) => {
    const item = occurrenceByKey.get(segment.key);
    if (item) onOpenEvent(item.event.id);
  };

  const { headline, live } = glance;
  const dotColor = headline
    ? resolveEventColor(headline.event.color, headline.calendar?.color, ACCENT)
    : undefined;

  return (
    <section
      className={`${styles.card} ${live ? styles.busy : styles.free}`}
      aria-label={live ? 'In an event' : 'Free right now'}
    >
      <div className={styles.top}>
        <button
          type="button"
          className={styles.headline}
          disabled={!headline}
          onClick={() => headline && onOpenEvent(headline.event.id)}
        >
          <span className={styles.eyebrow}>{glance.eyebrow}</span>
          <strong className={styles.title}>{glance.title}</strong>
          <span className={styles.meta}>
            {dotColor && <span className={styles.dot} style={{ backgroundColor: dotColor }} />}
            <span className={styles.metaText}>{glance.meta}</span>
          </span>
        </button>
      </div>

      <div className={styles.divider} />

      <div className={styles.capacityRow}>
        <p className={styles.capacity}>
          <strong>{glance.capacity}</strong>
          {glance.capacityDetail && <span> · {glance.capacityDetail}</span>}
        </p>
        {allDay.length > 0 && <span className={styles.allDay}>{allDay.length} all-day</span>}
      </div>

      {dayBar && (
        <DayBar
          model={dayBar}
          hourCycle={hourCycle}
          describeSegment={describeSegment}
          onOpenSegment={openSegment}
        />
      )}
    </section>
  );
}
