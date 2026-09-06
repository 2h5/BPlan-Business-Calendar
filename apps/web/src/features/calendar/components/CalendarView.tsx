import { toZonedDateKey } from '@cal/domain';
import type { Calendar } from '@cal/schemas';
import { useCallback, useMemo, useState } from 'react';

import { CalendarSidebar } from './CalendarSidebar';
import { CalendarToolbar } from './CalendarToolbar';
import styles from './CalendarView.module.css';
import { EventDetails } from './EventDetails';
import { MonthView } from './MonthView';
import { TimelineView } from './TimelineView';
import { type EventOccurrence, useCalendarWindow } from '../hooks/useCalendarWindow';
import { type CalendarViewMode, formatRangeHeading, shiftDateKey } from '../utils/calendar-window';

function CalendarState({
  kind,
  onRetry,
}: {
  kind: 'loading' | 'empty' | 'error';
  onRetry?: () => void;
}) {
  const copy = {
    loading: ['Loading your calendar', 'Bringing your calendars and events into view.'],
    empty: [
      'Nothing scheduled here',
      'This range is clear. Events from visible calendars will appear here.',
    ],
    error: ['We could not load your calendar', 'Check the local connection and try again.'],
  }[kind];

  return (
    <div className={styles.statePanel} role={kind === 'error' ? 'alert' : 'status'}>
      <svg
        viewBox="0 0 24 24"
        width="36"
        height="36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        {kind === 'error' ? <path d="M12 14v3M12 19h.01" /> : null}
      </svg>
      <strong>{copy[0]}</strong>
      <span>{copy[1]}</span>
      {kind === 'error' && onRetry ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function CalendarView() {
  const initialTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [mode, setMode] = useState<CalendarViewMode>('week');
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    toZonedDateKey(new Date(), initialTimeZone),
  );
  const [visibilityOverrides, setVisibilityOverrides] = useState<Record<string, boolean>>({});
  const [selectedOccurrence, setSelectedOccurrence] = useState<EventOccurrence | null>(null);

  const result = useCalendarWindow(mode, selectedDateKey, visibilityOverrides);
  const { window, timeZone } = result;
  const heading = useMemo(
    () => formatRangeHeading(mode, selectedDateKey, window, timeZone),
    [mode, selectedDateKey, timeZone, window],
  );

  const handleToggleVisibility = useCallback(
    (calendar: Calendar) => {
      setVisibilityOverrides((current) => ({
        ...current,
        [calendar.id]: !(current[calendar.id] ?? calendar.isVisible),
      }));
      if (selectedOccurrence?.event.calendarId === calendar.id) setSelectedOccurrence(null);
    },
    [selectedOccurrence],
  );

  const changeMode = useCallback((nextMode: CalendarViewMode) => {
    setMode(nextMode);
    setSelectedOccurrence(null);
  }, []);

  const selectMonthDate = useCallback((dateKey: string) => {
    setSelectedDateKey(dateKey);
    setMode('day');
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDateKey(toZonedDateKey(new Date(), timeZone));
  }, [timeZone]);

  return (
    <div className={styles.workspace}>
      <CalendarSidebar
        calendars={result.calendars}
        visibilityOverrides={visibilityOverrides}
        timeZone={timeZone}
        onToggleVisibility={handleToggleVisibility}
      />

      <section className={styles.calendarMain} aria-label="Calendar">
        <CalendarToolbar
          mode={mode}
          heading={heading}
          isFetching={result.isFetching && !result.isLoading}
          onModeChange={changeMode}
          onPrevious={() => setSelectedDateKey(shiftDateKey(selectedDateKey, mode, -1, timeZone))}
          onToday={goToToday}
          onNext={() => setSelectedDateKey(shiftDateKey(selectedDateKey, mode, 1, timeZone))}
        />

        <div className={styles.calendarSurface}>
          {result.isLoading ? (
            <CalendarState kind="loading" />
          ) : result.isError ? (
            <CalendarState kind="error" onRetry={result.refetch} />
          ) : mode === 'month' ? (
            <MonthView
              dateKeys={window.dateKeys}
              byDateKey={result.byDateKey}
              selectedDateKey={selectedDateKey}
              timeZone={timeZone}
              now={new Date()}
              onSelectDate={selectMonthDate}
              onSelectEvent={setSelectedOccurrence}
            />
          ) : (
            <TimelineView
              dateKeys={window.dateKeys}
              byDateKey={result.byDateKey}
              selectedDateKey={selectedDateKey}
              timeZone={timeZone}
              hourCycle={result.hourCycle}
              now={new Date()}
              onSelectDate={setSelectedDateKey}
              onSelectEvent={setSelectedOccurrence}
            />
          )}

          {!result.isLoading && !result.isError && result.occurrences.length === 0 ? (
            <div className={styles.emptyOverlay}>
              <CalendarState kind="empty" />
            </div>
          ) : null}
        </div>
      </section>

      {selectedOccurrence ? (
        <>
          <button
            type="button"
            className={styles.detailsBackdrop}
            onClick={() => setSelectedOccurrence(null)}
            aria-label="Close event details"
          />
          <EventDetails
            occurrence={selectedOccurrence}
            timeZone={timeZone}
            hourCycle={result.hourCycle}
            onClose={() => setSelectedOccurrence(null)}
          />
        </>
      ) : null}
    </div>
  );
}
