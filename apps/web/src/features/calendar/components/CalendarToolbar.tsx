import styles from './CalendarView.module.css';
import type { CalendarViewMode } from '../utils/calendar-window';

interface CalendarToolbarProps {
  mode: CalendarViewMode;
  heading: string;
  isFetching: boolean;
  onModeChange: (mode: CalendarViewMode) => void;
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
  onCreateEvent: () => void;
}

const MODES: { value: CalendarViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

export function CalendarToolbar({
  mode,
  heading,
  isFetching,
  onModeChange,
  onPrevious,
  onToday,
  onNext,
  onCreateEvent,
}: CalendarToolbarProps) {
  return (
    <header className={styles.calendarToolbar}>
      <div className={styles.rangeBlock}>
        <span className={styles.eyebrow}>{mode} view</span>
        <h2 className={styles.rangeHeading}>{heading}</h2>
      </div>

      <div className={styles.toolbarControls}>
        <button
          type="button"
          className={styles.newEventButton}
          onClick={onCreateEvent}
          aria-label="New event"
        >
          <span aria-hidden="true">+</span>
          <span className={styles.newEventLabel}>New event</span>
        </button>
        <div className={styles.navigationGroup} aria-label="Calendar navigation">
          <button
            type="button"
            className={styles.iconButton}
            onClick={onPrevious}
            aria-label={`Previous ${mode}`}
            title={`Previous ${mode}`}
          >
            <Chevron direction="left" />
          </button>
          <button type="button" className={styles.todayButton} onClick={onToday}>
            Today
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onNext}
            aria-label={`Next ${mode}`}
            title={`Next ${mode}`}
          >
            <Chevron direction="right" />
          </button>
        </div>

        <div className={styles.viewSwitcher} aria-label="Calendar view">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${styles.viewButton} ${mode === item.value ? styles.viewButtonActive : ''}`}
              onClick={() => onModeChange(item.value)}
              aria-pressed={mode === item.value}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isFetching ? (
        <span className={styles.fetchIndicator} aria-label="Refreshing calendar" />
      ) : null}
    </header>
  );
}
