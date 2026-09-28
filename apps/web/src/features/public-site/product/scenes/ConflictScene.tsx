import { hasConflict } from '@cal/domain';
import { useRef, useState, type CSSProperties } from 'react';

import styles from './ConflictScene.module.css';
import demo from './demo.module.css';
import {
  DEMO_COLORS,
  DEMO_TODAY,
  demoInstant,
  eventsOnDay,
  formatDemoTime,
  type DemoEvent,
} from '../demo-data';
import { useLoopFrame, usePrefersReducedMotion } from '../hooks/useScenePlayback';

const WINDOW_START = 11 * 60;
const WINDOW_END = 17 * 60;
const LENGTH = 45;
const LOOP_MS = 11_000;

const DAY = eventsOnDay(DEMO_TODAY);
const BUSY = DAY.map((event) => ({
  start: demoInstant(DEMO_TODAY, event.start),
  end: demoInstant(DEMO_TODAY, event.end),
}));

/** Where the dragged event's start sits over the loop: [ms, minute]. */
const TRACK: ReadonlyArray<readonly [number, number]> = [
  [0, 11 * 60 + 45],
  [700, 11 * 60 + 45],
  [2100, 13 * 60 + 10],
  [3500, 13 * 60 + 10],
  [4700, 14 * 60 + 40],
  [5900, 14 * 60 + 40],
  [7100, 15 * 60 + 45],
  [LOOP_MS, 15 * 60 + 45],
];
/** The event is held (lifted) until it is dropped in the clear. */
const DROP_AT = 7100;
const RESTING_MINUTE = 15 * 60 + 45;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function minuteAt(ms: number): number {
  for (let i = 1; i < TRACK.length; i += 1) {
    const [t1, m1] = TRACK[i] ?? [0, 0];
    const [t0, m0] = TRACK[i - 1] ?? [0, 0];
    if (ms <= t1) return m0 + (m1 - m0) * ease(t1 === t0 ? 1 : (ms - t0) / (t1 - t0));
  }
  return RESTING_MINUTE;
}

/** Conflict detection is the app's own: `hasConflict` from @cal/domain. */
function conflictAt(minute: number): DemoEvent | null {
  const candidate = {
    start: demoInstant(DEMO_TODAY, minute),
    end: demoInstant(DEMO_TODAY, minute + LENGTH),
  };
  if (!hasConflict(candidate, BUSY)) return null;
  return (
    DAY.find((event) =>
      hasConflict(candidate, [
        { start: demoInstant(DEMO_TODAY, event.start), end: demoInstant(DEMO_TODAY, event.end) },
      ]),
    ) ?? null
  );
}

const fraction = (minute: number) => (minute - WINDOW_START) / (WINDOW_END - WINDOW_START);

/**
 * A new event is dragged down the afternoon. It turns red the instant it
 * touches something, names what it hit, and only settles once it lands in
 * genuinely free time.
 */
export function ConflictScene({ playing }: { playing: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const blockRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({
    minute: RESTING_MINUTE,
    conflict: null as DemoEvent | null,
    dropped: true,
  });

  useLoopFrame(LOOP_MS, playing && !reducedMotion, (progress) => {
    const ms = progress * LOOP_MS;
    const exact = minuteAt(ms);
    blockRef.current?.style.setProperty('--top', String(fraction(exact)));
    const minute = Math.round(exact / 5) * 5;
    const conflict = conflictAt(exact);
    const dropped = ms >= DROP_AT;
    setState((previous) =>
      previous.minute === minute && previous.conflict === conflict && previous.dropped === dropped
        ? previous
        : { minute, conflict, dropped },
    );
  });

  const hours: number[] = [];
  for (let minute = WINDOW_START; minute <= WINDOW_END; minute += 60) hours.push(minute);

  return (
    <div className={`${demo.surface} ${styles.panel}`}>
      <div className={styles.header}>
        <span>
          Tuesday <b>6</b>
        </span>
        <span className={styles.engine}>Checked against every event, every move</span>
      </div>

      <div className={styles.timeline}>
        {hours.map((minute) => (
          <div key={minute} className={styles.hour} style={{ top: `${fraction(minute) * 100}%` }}>
            <span className={demo.hourLabel}>{formatDemoTime(minute)}</span>
            <span className={demo.hourLine} />
          </div>
        ))}

        {DAY.filter((event) => event.end > WINDOW_START).map((event) => {
          const start = Math.max(event.start, WINDOW_START);
          return (
            <div
              key={event.id}
              className={`${demo.event} ${styles.existing}`}
              data-hit={state.conflict?.id === event.id}
              style={
                {
                  top: `${fraction(start) * 100}%`,
                  height: `calc(${(fraction(event.end) - fraction(start)) * 100}% - 3px)`,
                  '--c': DEMO_COLORS[event.color],
                } as CSSProperties
              }
            >
              <span className={demo.eventTitle}>{event.title}</span>
              <span className={demo.eventTime}>
                {formatDemoTime(event.start)} – {formatDemoTime(event.end)}
              </span>
            </div>
          );
        })}

        <div
          ref={blockRef}
          className={styles.moving}
          data-conflict={state.conflict !== null}
          data-dropped={state.dropped}
          style={
            {
              '--top': fraction(RESTING_MINUTE),
              height: `calc(${(LENGTH / (WINDOW_END - WINDOW_START)) * 100}% - 3px)`,
            } as CSSProperties
          }
        >
          <span className={styles.movingTitle}>Call with Sam</span>
          <span className={styles.movingTime}>
            {formatDemoTime(state.minute)} – {formatDemoTime(state.minute + LENGTH)}
          </span>

          <span className={styles.verdict} data-conflict={state.conflict !== null}>
            {state.conflict ? (
              <>
                <WarnGlyph /> Overlaps {state.conflict.title}
              </>
            ) : state.dropped ? (
              <>
                <OkGlyph /> No conflicts
              </>
            ) : (
              <>Free</>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function WarnGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 4.5v4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="1" fill="currentColor" />
    </svg>
  );
}

function OkGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m4 8.4 2.6 2.5L12 5.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
