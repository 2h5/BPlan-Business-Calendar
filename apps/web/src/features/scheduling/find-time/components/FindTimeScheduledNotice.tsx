import type React from 'react';
import { Link } from 'react-router-dom';

import styles from './FindTimeBox.module.css';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  PlusIcon,
} from './FindTimeIcons';
import type { FindTimeConfirmation } from '../api/find-time.api';
import { formatSlot, getEventDateKey } from '../utils/find-time-format';

type ScheduledEvent = FindTimeConfirmation['event'];

function calendarLinkFor(event: ScheduledEvent): string {
  return event.id
    ? `/calendar?date=${getEventDateKey(event.startAt)}&event=${event.id}`
    : '/calendar';
}

interface ScheduledConfirmationCardProps {
  event: ScheduledEvent;
  timeZone: string;
  onScheduleAnother: () => void;
}

export function ScheduledConfirmationCard({
  event,
  timeZone,
  onScheduleAnother,
}: ScheduledConfirmationCardProps) {
  return (
    <div className={styles.confirmationCard} role="status">
      <div className={styles.confirmationHeader}>
        <div className={styles.checkIconWrap}>
          <CheckCircleIcon />
        </div>
        <div className={styles.confirmationMain}>
          <div className={styles.confirmationBadgeRow}>
            <span className={styles.confirmationBadge}>Successfully Scheduled</span>
            <span className={styles.confirmationLiveIndicator}>✦ Synced</span>
          </div>
          <h3 className={styles.confirmationTitle}>{event.title}</h3>
          <div className={styles.confirmationTimeRow}>
            <CalendarIcon />
            <span>{formatSlot(event.startAt, event.endAt, timeZone)}</span>
          </div>
        </div>
      </div>

      <div className={styles.confirmationActions}>
        <button type="button" className={styles.actionResetButton} onClick={onScheduleAnother}>
          <PlusIcon />
          <span>Schedule another</span>
        </button>
        <Link to={calendarLinkFor(event)} className={styles.actionCalendarButton}>
          <span>View in Calendar</span>
          <ArrowRightIcon />
        </Link>
      </div>
    </div>
  );
}

interface ScheduledBannerProps {
  event: ScheduledEvent;
  timeZone: string;
  isExiting: boolean;
  remainingMs: number;
  totalDurationMs: number;
  onDismiss: () => void;
}

export function ScheduledBanner({
  event,
  timeZone,
  isExiting,
  remainingMs,
  totalDurationMs,
  onDismiss,
}: ScheduledBannerProps) {
  return (
    <div
      className={`${styles.recentBanner} ${isExiting ? styles.recentBannerExiting : ''}`}
      role="status"
    >
      <div className={styles.recentBannerMain}>
        <div className={styles.recentCheckIcon}>
          <CheckIcon />
        </div>
        <div className={styles.recentText}>
          <span className={styles.recentTag}>Scheduled</span>
          <span className={styles.recentTitle}>{event.title}</span>
          <span className={styles.recentSeparator}>·</span>
          <span className={styles.recentTime}>
            {formatSlot(event.startAt, event.endAt, timeZone)}
          </span>
        </div>
      </div>
      <div className={styles.recentActions}>
        <Link to={calendarLinkFor(event)} className={styles.recentCalendarLink}>
          <span>View in Calendar</span>
          <ArrowRightIcon />
        </Link>
        <button
          type="button"
          className={styles.recentDismissButton}
          onClick={onDismiss}
          aria-label="Dismiss scheduled notice"
        >
          ✕
        </button>
      </div>
      <div
        className={styles.bannerTimerBar}
        style={
          {
            '--start-width': `${Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100))}%`,
            '--deplete-duration': `${remainingMs}ms`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}
