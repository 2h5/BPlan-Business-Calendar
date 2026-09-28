import { useMemo, type CSSProperties } from 'react';

import demo from './demo.module.css';
import { buildFindTimeDemo, FIND_TIME_DAY, FIND_TIME_PROMPT } from './find-time-demo';
import styles from './FindTimeScene.module.css';
import { SparkGlyph } from './glyphs';
import { DEMO_COLORS, dayFraction, eventsOnDay, formatDemoTime } from '../demo-data';
import { usePrefersReducedMotion, useSequence, useTypedCount } from '../hooks/useScenePlayback';

const TYPE_MS = 42;
const Step = {
  Idle: 0,
  Typing: 1,
  Parsed: 2,
  Searching: 3,
  Suggested: 4,
  Picked: 5,
  Booked: 6,
  Reset: 7,
} as const;
const HOLDS = [700, FIND_TIME_PROMPT.length * TYPE_MS + 250, 900, 1100, 2600, 900, 3200, 700];

/**
 * Find Time, start to finish: a request is typed, read into duration and
 * timing, answered with real open slots, and the best one is booked into the
 * day. Each step is the app's own logic running on the sample calendar.
 */
export function FindTimeScene({ playing }: { playing: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const result = useMemo(buildFindTimeDemo, []);
  const sequenced = useSequence(HOLDS, playing && !reducedMotion);
  const step: number = reducedMotion ? Step.Booked : sequenced;
  const typed = useTypedCount(FIND_TIME_PROMPT, step === Step.Typing, TYPE_MS);

  const shownText =
    step === Step.Idle || step === Step.Reset
      ? ''
      : step === Step.Typing
        ? FIND_TIME_PROMPT.slice(0, typed)
        : FIND_TIME_PROMPT;
  const picked = result.suggestions[0];
  const dayEvents = eventsOnDay(FIND_TIME_DAY);

  return (
    <div
      className={`${demo.surface} ${styles.panel}`}
      data-step={step}
      data-resetting={step === Step.Reset}
    >
      <div className={styles.prompt}>
        <SparkGlyph />
        <span className={styles.text}>
          {shownText || <span className={styles.placeholder}>Ask for time…</span>}
          {step <= Step.Typing ? <span className={styles.caret} /> : null}
        </span>
      </div>

      <div className={styles.chips} data-visible={step >= Step.Parsed}>
        <span className={styles.readback}>{result.title}</span>
        {result.chips.map((chip, index) => (
          <span key={chip} className={demo.chip} style={{ '--i': index } as CSSProperties}>
            {chip}
          </span>
        ))}
      </div>

      <div className={styles.results}>
        <div className={styles.searching} data-visible={step === Step.Searching}>
          <span />
          Finding open time on Wednesday
        </div>

        <ol className={styles.list} data-visible={step >= Step.Suggested}>
          {result.suggestions.map((slot, index) => (
            <li
              key={slot.id}
              style={{ '--i': index } as CSSProperties}
              data-picked={step >= Step.Picked && index === 0}
              data-dimmed={step >= Step.Picked && index !== 0}
            >
              <span className={styles.rank}>{index + 1}</span>
              <span className={styles.slotCopy}>
                <strong>
                  Wed · {formatDemoTime(slot.start, false)} – {formatDemoTime(slot.end)}
                </strong>
                <span>{slot.reason}</span>
              </span>
              <span className={styles.book}>
                {step >= Step.Booked && index === 0 ? 'Booked' : 'Book'}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.strip} aria-hidden="true">
        <span className={styles.stripLabel}>Wed 7</span>
        <div className={styles.track}>
          {dayEvents.map((event) => (
            <i
              key={event.id}
              style={
                {
                  left: `${dayFraction(event.start) * 100}%`,
                  width: `${(dayFraction(event.end) - dayFraction(event.start)) * 100}%`,
                  '--c': DEMO_COLORS[event.color],
                } as CSSProperties
              }
            />
          ))}
          {picked ? (
            <b
              className={styles.booked}
              data-visible={step >= Step.Booked}
              style={{
                left: `${dayFraction(picked.start) * 100}%`,
                width: `${(dayFraction(picked.end) - dayFraction(picked.start)) * 100}%`,
              }}
            />
          ) : null}
        </div>
      </div>

      <p className={styles.note}>
        Every time comes from the availability engine. The AI only ranks and explains them.
      </p>
    </div>
  );
}
