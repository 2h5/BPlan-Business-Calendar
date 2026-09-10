import type { Calendar } from '@cal/schemas';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import styles from './CalendarView.module.css';
import type { CalendarViewMode } from '../utils/calendar-window';

interface CalendarToolbarProps {
  mode: CalendarViewMode;
  heading: string;
  isFetching: boolean;
  calendars: readonly Calendar[];
  timeZone: string;
  onToggleVisibility: (calendar: Calendar) => void;
  onCreateCalendar: () => void;
  onEditCalendar: (calendar: Calendar) => void;
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

function CalendarIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

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
  calendars,
  timeZone,
  onToggleVisibility,
  onCreateCalendar,
  onEditCalendar,
  onModeChange,
  onPrevious,
  onToday,
  onNext,
  onCreateEvent,
}: CalendarToolbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuWrapperRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  const visibleCount = useMemo(() => calendars.filter((c) => c.isVisible).length, [calendars]);

  const closeDropdown = useCallback(() => {
    if (!isOpen || isClosing) return;
    setIsClosing(true);
  }, [isOpen, isClosing]);

  const toggleDropdown = useCallback(() => {
    if (isOpen) {
      closeDropdown();
    } else {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
      setIsClosing(false);
      setIsOpen(true);
    }
  }, [isOpen, closeDropdown]);

  const handleAnimationEnd = (event: React.AnimationEvent) => {
    if (isClosing && event.target === dropdownRef.current) {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
      setIsClosing(false);
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isClosing) {
      closeTimeoutRef.current = window.setTimeout(() => {
        setIsClosing(false);
        setIsOpen(false);
      }, 150);
      return () => {
        if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
      };
    }
  }, [isClosing]);

  useEffect(() => {
    if (!isOpen || isClosing) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuWrapperRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdown();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isClosing, closeDropdown]);

  return (
    <header className={styles.calendarToolbar}>
      <div className={styles.rangeBlock}>
        <span className={styles.eyebrow}>{mode} view</span>
        <h2 className={styles.rangeHeading}>{heading}</h2>
      </div>

      <div className={styles.toolbarControls}>
        <div ref={menuWrapperRef} className={styles.calendarsMenuWrapper}>
          <button
            type="button"
            className={`${styles.calendarsTrigger} ${
              isOpen && !isClosing ? styles.calendarsTriggerActive : ''
            }`}
            onClick={toggleDropdown}
            aria-expanded={isOpen && !isClosing}
            aria-haspopup="dialog"
            aria-label="Filter calendars"
            title="Calendars"
          >
            <CalendarIcon />
            <span>Calendars</span>
            <span className={styles.calendarsTriggerBadge}>
              {visibleCount}/{calendars.length}
            </span>
            <svg
              className={`${styles.calendarsChevron} ${
                isOpen && !isClosing ? styles.calendarsChevronOpen : ''
              }`}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {isOpen && (
            <div
              ref={dropdownRef}
              className={`${styles.calendarsDropdown} ${
                isClosing ? styles.calendarsDropdownClosing : ''
              }`}
              role="dialog"
              aria-label="My calendars"
              onAnimationEnd={handleAnimationEnd}
            >
              <div className={styles.dropdownHeader}>
                <span className={styles.dropdownEyebrow}>Calendars</span>
                <button
                  type="button"
                  className={styles.dropdownAddButton}
                  onClick={() => {
                    closeDropdown();
                    onCreateCalendar();
                  }}
                  aria-label="Create calendar"
                  title="Create calendar"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>

              <div className={styles.dropdownCalendarList}>
                {calendars.length === 0 ? (
                  <p className={styles.calendarEmpty}>No calendars are available yet.</p>
                ) : (
                  calendars.map((calendar) => {
                    const isVisible = calendar.isVisible;
                    return (
                      <div
                        key={calendar.id}
                        className={`${styles.dropdownCalendarRow} ${
                          isVisible ? '' : styles.dropdownCalendarRowHidden
                        }`}
                      >
                        <button
                          type="button"
                          className={styles.dropdownCalendarToggle}
                          onClick={() => onToggleVisibility(calendar)}
                          aria-pressed={isVisible}
                          aria-label={`${isVisible ? 'Hide' : 'Show'} ${calendar.name}`}
                          title={`${isVisible ? 'Hide' : 'Show'} ${calendar.name}`}
                        >
                          <span
                            className={styles.dropdownCheckbox}
                            style={{
                              borderColor: calendar.color,
                              backgroundColor: isVisible ? calendar.color : 'transparent',
                            }}
                            aria-hidden="true"
                          >
                            {isVisible ? (
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : null}
                          </span>
                          <span className={styles.dropdownCalendarInfo}>
                            <span className={styles.dropdownCalendarName}>{calendar.name}</span>
                            <span className={styles.dropdownCalendarMeta}>
                              {calendar.isDefault ? 'Default · ' : ''}
                              {calendar.sourceType === 'internal' ? 'BPlan' : calendar.sourceType}
                              {calendar.isReadOnly ? ' · Read only' : ''}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={styles.dropdownEditButton}
                          onClick={() => {
                            closeDropdown();
                            onEditCalendar(calendar);
                          }}
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

              <div className={styles.dropdownFooter}>
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
                </svg>
                <span>{timeZone.replaceAll('_', ' ')}</span>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={styles.newEventButton}
          onClick={onCreateEvent}
          aria-label="New event"
        >
          <CalendarIcon />
          <span>New Event</span>
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
