import type { Calendar } from '@cal/schemas';

import styles from './CalendarView.module.css';

interface CalendarSidebarProps {
  calendars: readonly Calendar[];
  visibilityOverrides: Readonly<Record<string, boolean>>;
  timeZone: string;
  onToggleVisibility: (calendar: Calendar) => void;
}

export function CalendarSidebar({
  calendars,
  visibilityOverrides,
  timeZone,
  onToggleVisibility,
}: CalendarSidebarProps) {
  return (
    <aside className={styles.calendarSidebar} aria-label="My calendars">
      <div className={styles.sidebarHeading}>
        <span className={styles.eyebrow}>Calendars</span>
        <span className={styles.sidebarCount}>{calendars.length}</span>
      </div>

      <div className={styles.calendarList}>
        {calendars.length === 0 ? (
          <p className={styles.calendarEmpty}>No calendars are available yet.</p>
        ) : (
          calendars.map((calendar) => {
            const isVisible = visibilityOverrides[calendar.id] ?? calendar.isVisible;
            return (
              <button
                key={calendar.id}
                type="button"
                className={`${styles.calendarToggle} ${isVisible ? '' : styles.calendarToggleHidden}`}
                onClick={() => onToggleVisibility(calendar)}
                aria-pressed={isVisible}
                aria-label={`${isVisible ? 'Hide' : 'Show'} ${calendar.name}`}
                title={`${isVisible ? 'Hide' : 'Show'} ${calendar.name} in this view`}
              >
                <span
                  className={styles.calendarCheckbox}
                  style={{
                    borderColor: calendar.color,
                    backgroundColor: isVisible ? calendar.color : 'transparent',
                  }}
                  aria-hidden="true"
                >
                  {isVisible ? '✓' : ''}
                </span>
                <span className={styles.calendarIdentity}>
                  <span className={styles.calendarName}>{calendar.name}</span>
                  <span className={styles.calendarMeta}>
                    {calendar.isDefault ? 'Default · ' : ''}
                    {calendar.sourceType === 'internal' ? 'BCal' : calendar.sourceType}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className={styles.timeZoneCard}>
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
        </svg>
        <span>
          <span className={styles.timeZoneLabel}>Display timezone</span>
          <span className={styles.timeZoneValue}>{timeZone.replaceAll('_', ' ')}</span>
        </span>
      </div>
    </aside>
  );
}
