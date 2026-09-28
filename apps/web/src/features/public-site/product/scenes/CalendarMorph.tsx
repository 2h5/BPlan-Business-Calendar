import type { CSSProperties } from 'react';

import styles from './CalendarMorph.module.css';
import demo from './demo.module.css';
import {
  DAY_END,
  DAY_START,
  DEMO_COLORS,
  DEMO_DATES,
  DEMO_DAYS,
  DEMO_EVENTS,
  DEMO_NOW,
  DEMO_TODAY,
  dayFraction,
  formatDemoTime,
  type DemoColor,
  type DemoEvent,
} from '../demo-data';

export type CalendarMode = 'day' | 'week' | 'month';

const GUTTER = '54px';
const MONTH_ROWS = 5;
/** The demo week is the second row of October 2026 (Mon 28 Sep starts the grid). */
const DEMO_WEEK_ROW = 1;
const MONTH_FIRST_DATE = new Date(Date.UTC(2026, 8, 28));
const MONTH_BAR_LIMIT = 3;
/** Too short for a second line: shown as one centred title. */
const SHORT_EVENT_MINUTES = 30;

/** Month-only events elsewhere in October, so the month isn't empty. */
const MONTH_EXTRAS: ReadonlyArray<{ cell: number; title: string; color: DemoColor }> = [
  { cell: 3, title: 'Offsite', color: 'lavender' },
  { cell: 4, title: 'Offsite', color: 'lavender' },
  { cell: 15, title: 'Launch', color: 'pink' },
  { cell: 16, title: 'Retro', color: 'sky' },
  { cell: 17, title: 'Dinner', color: 'apricot' },
  { cell: 22, title: 'Board prep', color: 'periwinkle' },
  { cell: 23, title: 'Dentist', color: 'mint' },
  { cell: 29, title: 'Review', color: 'periwinkle' },
  { cell: 31, title: 'Trip', color: 'apricot' },
];

interface CalendarMorphProps {
  mode: CalendarMode;
  /** Events fall into place once this turns true. */
  revealed: boolean;
  className?: string;
}

/**
 * A live calendar that moves between day, week, and month by animating each
 * event from one layout to the next, so the same meeting is visibly the same
 * block in every view.
 */
export function CalendarMorph({ mode, revealed, className }: CalendarMorphProps) {
  const monthIndex = monthIndexByEvent();

  return (
    <div className={`${styles.board} ${className ?? ''}`} data-mode={mode} data-revealed={revealed}>
      <Header mode={mode} />

      <div className={styles.body}>
        <div className={styles.hours} aria-hidden="true">
          {hourMarks().map((minute) => (
            <div key={minute} style={{ top: `${dayFraction(minute) * 100}%` }}>
              <span className={demo.hourLabel}>{formatDemoTime(minute)}</span>
              <span className={demo.hourLine} />
            </div>
          ))}
          <span className={styles.now} style={{ top: `${dayFraction(DEMO_NOW) * 100}%` }}>
            <span className={demo.nowLine} />
          </span>
        </div>

        <MonthCells />

        {DEMO_EVENTS.map((event, index) => {
          const slot = monthIndex.get(event.id) ?? 0;
          return (
            <div
              key={event.id}
              className={`${demo.event} ${styles.event}`}
              data-hidden={isHidden(event, mode, slot)}
              data-short={event.end - event.start <= SHORT_EVENT_MINUTES}
              style={
                {
                  ...eventBox(event, mode, slot),
                  '--c': DEMO_COLORS[event.color],
                  '--order': index,
                  '--cascade': event.day * 5 + (index % 4),
                } as CSSProperties
              }
            >
              <span className={demo.eventTitle}>{event.title}</span>
              <span className={`${demo.eventTime} ${styles.eventTime}`}>
                {formatDemoTime(event.start)} – {formatDemoTime(event.end)}
              </span>
            </div>
          );
        })}

        {MONTH_EXTRAS.map((extra) => (
          <div
            key={`${extra.cell}-${extra.title}`}
            className={`${demo.event} ${styles.event} ${styles.extra}`}
            style={
              {
                ...monthBar(extra.cell % 7, Math.floor(extra.cell / 7), 0),
                '--c': DEMO_COLORS[extra.color],
              } as CSSProperties
            }
          >
            <span className={demo.eventTitle}>{extra.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ mode }: { mode: CalendarMode }) {
  return (
    <div className={styles.header} aria-hidden="true">
      <div className={`${styles.headerRow} ${styles.headerWeek}`} data-active={mode === 'week'}>
        {DEMO_DAYS.map((day, index) => (
          <span key={day} data-today={index === DEMO_TODAY}>
            {day} <b>{DEMO_DATES[index]}</b>
          </span>
        ))}
      </div>
      <div className={`${styles.headerRow} ${styles.headerDay}`} data-active={mode === 'day'}>
        <span data-today="true">
          Tuesday <b>{DEMO_DATES[DEMO_TODAY]}</b>
        </span>
      </div>
      <div className={`${styles.headerRow} ${styles.headerMonth}`} data-active={mode === 'month'}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
    </div>
  );
}

function MonthCells() {
  return (
    <div className={styles.monthCells} aria-hidden="true">
      {Array.from({ length: MONTH_ROWS * 7 }, (_, cell) => {
        const date = new Date(MONTH_FIRST_DATE.getTime() + cell * 86_400_000);
        const inMonth = date.getUTCMonth() === 9;
        const isToday = cell === DEMO_WEEK_ROW * 7 + DEMO_TODAY;
        return (
          <span key={cell} data-muted={!inMonth} data-today={isToday}>
            <b>{date.getUTCDate()}</b>
          </span>
        );
      })}
    </div>
  );
}

function hourMarks(): number[] {
  const marks: number[] = [];
  for (let minute = DAY_START + 60; minute < DAY_END; minute += 60) marks.push(minute);
  return marks;
}

/** Each event's position among its day's events, for stacking month bars. */
function monthIndexByEvent(): Map<string, number> {
  const counts = new Map<number, number>();
  const result = new Map<string, number>();
  for (const event of DEMO_EVENTS) {
    const index = counts.get(event.day) ?? 0;
    counts.set(event.day, index + 1);
    result.set(event.id, index);
  }
  return result;
}

function isHidden(event: DemoEvent, mode: CalendarMode, monthSlot: number): boolean {
  if (mode === 'day') return event.day !== DEMO_TODAY;
  if (mode === 'month') return monthSlot >= MONTH_BAR_LIMIT;
  return false;
}

function eventBox(event: DemoEvent, mode: CalendarMode, monthSlot: number): CSSProperties {
  if (mode === 'month') {
    return monthBar(event.day, DEMO_WEEK_ROW, Math.min(monthSlot, MONTH_BAR_LIMIT - 1));
  }

  const top = `${dayFraction(event.start) * 100}%`;
  const height = `calc(${(dayFraction(event.end) - dayFraction(event.start)) * 100}% - 3px)`;

  if (mode === 'week') {
    return {
      top,
      height,
      left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${event.day / 5} + 3px)`,
      width: `calc((100% - ${GUTTER}) / 5 - 6px)`,
    };
  }

  // Day view: Tuesday fills the width; the other days slide off to their side.
  const offset = event.day - DEMO_TODAY;
  return {
    top,
    height,
    left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${offset} + 6px)`,
    width: `calc(100% - ${GUTTER} - 12px)`,
  };
}

function monthBar(column: number, row: number, slot: number): CSSProperties {
  return {
    top: `calc(100% * ${row / MONTH_ROWS} + 26px + ${slot * 19}px)`,
    height: '16px',
    left: `calc(100% * ${column / 7} + 4px)`,
    width: 'calc(100% / 7 - 8px)',
  };
}
