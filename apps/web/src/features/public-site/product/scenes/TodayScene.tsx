import { useRef, useState, type CSSProperties } from 'react';

import demo from './demo.module.css';
import styles from './TodayScene.module.css';
import {
  DAY_END,
  DAY_START,
  DEMO_COLORS,
  DEMO_NOW,
  DEMO_TODAY,
  dayFraction,
  eventsOnDay,
  formatDemoDuration,
  formatDemoTime,
} from '../demo-data';
import { useLoopFrame, usePrefersReducedMotion } from '../hooks/useScenePlayback';

const DAY = eventsOnDay(DEMO_TODAY);
/** One pass of the clock across the working day. */
const SWEEP_MS = 16_000;
const STEP_MINUTES = 5;

interface Glance {
  busy: boolean;
  title: string;
  detail: string;
  freeLeft: number;
}

function describe(minute: number): Glance {
  const freeLeft = freeMinutesAfter(minute);
  const current = DAY.find((event) => event.start <= minute && minute < event.end);
  if (current) {
    return {
      busy: true,
      title: current.title,
      detail: `Until ${formatDemoTime(current.end)} · ${formatDemoDuration(current.end - minute)} left`,
      freeLeft,
    };
  }
  const next = DAY.find((event) => event.start > minute);
  if (next) {
    return {
      busy: false,
      title: next.title,
      detail: `In ${formatDemoDuration(next.start - minute)} · ${formatDemoTime(next.start)}`,
      freeLeft,
    };
  }
  return { busy: false, title: 'Nothing else today', detail: 'The rest is yours', freeLeft };
}

function freeMinutesAfter(minute: number): number {
  let free = DAY_END - minute;
  for (const event of DAY) {
    free -= Math.max(0, Math.min(event.end, DAY_END) - Math.max(event.start, minute));
  }
  return Math.max(0, free);
}

/**
 * Today, live: the clock sweeps across the day and the glance answers "am I
 * free?" at every moment. Green while nothing is running, red once a meeting
 * starts, with the free time left recounted as it goes.
 */
export function TodayScene({ playing }: { playing: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const markerRef = useRef<HTMLSpanElement>(null);
  const [minute, setMinute] = useState(DEMO_NOW);

  useLoopFrame(SWEEP_MS, playing && !reducedMotion, (progress) => {
    const exact = DAY_START + progress * (DAY_END - DAY_START);
    markerRef.current?.style.setProperty('--at', String(dayFraction(exact)));
    setMinute(Math.floor(exact / STEP_MINUTES) * STEP_MINUTES);
  });

  const glance = describe(minute);
  const active = DAY.find((event) => event.start <= minute && minute < event.end);

  return (
    <div className={`${demo.surface} ${styles.panel}`} data-busy={glance.busy}>
      <div className={styles.top}>
        <span className={styles.status}>
          <i />
          {glance.busy ? 'In an event' : 'Free now'}
        </span>
        <span className={styles.clock}>{formatDemoTime(minute)}</span>
      </div>

      <p className={styles.title} key={glance.title}>
        {glance.title}
      </p>
      <p className={styles.detail}>{glance.detail}</p>

      <div className={styles.bar} aria-hidden="true">
        {DAY.map((event) => (
          <i
            key={event.id}
            data-active={event === active}
            style={
              {
                left: `${dayFraction(event.start) * 100}%`,
                width: `${(dayFraction(event.end) - dayFraction(event.start)) * 100}%`,
                '--c': DEMO_COLORS[event.color],
              } as CSSProperties
            }
          />
        ))}
        <span
          ref={markerRef}
          className={styles.marker}
          style={{ '--at': dayFraction(DEMO_NOW) } as CSSProperties}
        />
      </div>
      <div className={styles.scale} aria-hidden="true">
        <span>8 AM</span>
        <span>1 PM</span>
        <span>6 PM</span>
      </div>

      <div className={styles.footer}>
        <span>
          <strong>{formatDemoDuration(glance.freeLeft)}</strong> free left today
        </span>
        <span>{DAY.filter((event) => event.start > minute).length} still to come</span>
      </div>
    </div>
  );
}
