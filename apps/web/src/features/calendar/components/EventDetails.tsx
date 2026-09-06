import { describeRRule, parseRRule, toZonedDateKey } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';

import styles from './CalendarView.module.css';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

interface EventDetailsProps {
  occurrence: EventOccurrence;
  timeZone: string;
  hourCycle: HourCycle;
  onClose: () => void;
}

function formatDateTime(
  occurrence: EventOccurrence,
  timeZone: string,
  hourCycle: HourCycle,
): string {
  const start = new Date(occurrence.start);
  const end = new Date(occurrence.end);
  if (occurrence.event.allDay) {
    const first = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(start);
    const lastInstant = new Date(Math.max(occurrence.start, occurrence.end - 1));
    return toZonedDateKey(start, timeZone) === toZonedDateKey(lastInstant, timeZone)
      ? `${first} · All day`
      : `${first} – ${new Intl.DateTimeFormat('en-US', { timeZone, month: 'long', day: 'numeric', year: 'numeric' }).format(lastInstant)} · All day`;
  }

  const sameDay = toZonedDateKey(start, timeZone) === toZonedDateKey(end, timeZone);
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(start);
  const timeFormat: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle,
  };
  const startTime = new Intl.DateTimeFormat('en-US', timeFormat).format(start);
  const endTime = new Intl.DateTimeFormat('en-US', {
    ...timeFormat,
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
  }).format(end);
  return `${date} · ${startTime} – ${endTime}`;
}

function DetailIcon({ kind }: { kind: 'time' | 'place' | 'repeat' | 'calendar' | 'note' }) {
  const paths = {
    time: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    place: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    repeat: (
      <>
        <path d="m17 1 4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    note: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      {paths[kind]}
    </svg>
  );
}

export function EventDetails({ occurrence, timeZone, hourCycle, onClose }: EventDetailsProps) {
  const { event, calendar } = occurrence;
  const parsedRule = event.recurrenceRule ? parseRRule(event.recurrenceRule) : null;

  return (
    <aside className={styles.eventDetails} aria-label="Event details">
      <div className={styles.detailsHeader}>
        <div>
          <span className={styles.eyebrow}>Event details</span>
          <span className={styles.readOnlyBadge}>Read only</span>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close event details"
          title="Close"
        >
          <svg
            viewBox="0 0 24 24"
            width="17"
            height="17"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className={styles.detailsBody}>
        <div className={styles.eventTitleBlock}>
          <span
            className={styles.eventColorBar}
            style={{ backgroundColor: calendar?.color ?? 'var(--color-accent)' }}
          />
          <div>
            <h3 className={styles.eventDetailsTitle}>{event.title}</h3>
            {event.status !== 'confirmed' ? (
              <span className={styles.statusBadge}>{event.status}</span>
            ) : null}
          </div>
        </div>

        <div className={styles.detailList}>
          <div className={styles.detailItem}>
            <DetailIcon kind="time" />
            <span>{formatDateTime(occurrence, timeZone, hourCycle)}</span>
          </div>
          <div className={styles.detailItem}>
            <DetailIcon kind="calendar" />
            <span>
              <strong>{calendar?.name ?? 'Calendar'}</strong>
              <small>
                {event.sourceType === 'internal' ? 'BCal calendar' : `${event.sourceType} calendar`}
              </small>
            </span>
          </div>
          {event.location ? (
            <div className={styles.detailItem}>
              <DetailIcon kind="place" />
              <span>{event.location}</span>
            </div>
          ) : null}
          {parsedRule ? (
            <div className={styles.detailItem}>
              <DetailIcon kind="repeat" />
              <span>{describeRRule(parsedRule)}</span>
            </div>
          ) : null}
          {event.description ? (
            <div className={`${styles.detailItem} ${styles.noteItem}`}>
              <DetailIcon kind="note" />
              <span>{event.description}</span>
            </div>
          ) : null}
        </div>

        <div className={styles.detailsFooter}>
          <span>Shown in {timeZone.replaceAll('_', ' ')}</span>
          {event.sourceType !== 'internal' || calendar?.isReadOnly ? (
            <span>Provider-owned event</span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
