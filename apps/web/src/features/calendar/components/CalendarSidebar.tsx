import type { Calendar } from '@cal/schemas';

import styles from './CalendarView.module.css';

interface CalendarSidebarProps {
  calendars: readonly Calendar[];
  timeZone: string;
  onToggleVisibility: (calendar: Calendar) => void;
  onCreateCalendar: () => void;
  onEditCalendar: (calendar: Calendar) => void;
}

export function CalendarSidebar({
  calendars,
  timeZone,
  onToggleVisibility,
  onCreateCalendar,
  onEditCalendar,
}: CalendarSidebarProps) {
  return (
    <aside className={styles.calendarSidebar} aria-label="My calendars">
      <div className={styles.sidebarHeading}>
        <span className={styles.eyebrow}>Calendars</span>
        <div className={styles.sidebarHeadingActions}>
          <span className={styles.sidebarCount}>{calendars.length}</span>
          <button
            type="button"
            className={styles.addCalendarButton}
            onClick={onCreateCalendar}
            aria-label="Create calendar"
            title="Create calendar"
          >
            +
          </button>
        </div>
      </div>

      <div className={styles.calendarList}>
        {calendars.length === 0 ? (
          <p className={styles.calendarEmpty}>No calendars are available yet.</p>
        ) : (
          calendars.map((calendar) => {
            const isVisible = calendar.isVisible;
            return (
              <div
                key={calendar.id}
                className={`${styles.calendarRow} ${isVisible ? '' : styles.calendarToggleHidden}`}
              >
                <button
                  type="button"
                  className={styles.calendarToggle}
                  onClick={() => onToggleVisibility(calendar)}
                  aria-pressed={isVisible}
                  aria-label={`${isVisible ? 'Hide' : 'Show'} ${calendar.name}`}
                  title={`${isVisible ? 'Hide' : 'Show'} ${calendar.name}`}
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
                      {calendar.sourceType === 'internal' ? 'BPlan' : calendar.sourceType}
                      {calendar.isReadOnly ? ' · Read only' : ''}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.calendarEditButton}
                  onClick={() => onEditCalendar(calendar)}
                  aria-label={`Edit ${calendar.name}`}
                  title={`Calendar settings for ${calendar.name}`}
                >
                  •••
                </button>
              </div>
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
