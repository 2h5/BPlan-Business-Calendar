import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import styles from './ProductHero.module.css';
import { usePrefersReducedMotion } from '../hooks/useScenePlayback';
import { CalendarMorph } from '../scenes/CalendarMorph';
import demo from '../scenes/demo.module.css';
import { SparkGlyph } from '../scenes/glyphs';

const HEADLINE = [
  ['One', 'calm', 'place'],
  ['for', 'your', 'whole', 'day.'],
] as const;
const ACCENT_WORDS = new Set(['whole', 'day.']);

/**
 * The top of the product page: the headline arrives word by word, then the
 * week settles in underneath with a few pieces of the app floating over it at
 * different depths, drifting apart as the visitor scrolls.
 */
export function ProductHero() {
  const stageRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), reducedMotion ? 0 : 520);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  // Scroll-linked depth: one custom property, eased layers read it in CSS.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reducedMotion) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(Math.max(window.scrollY / 700, 0), 1);
      stage.style.setProperty('--depth', progress.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  let wordIndex = 0;

  return (
    <section className={styles.hero} aria-labelledby="product-hero-title">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>The BPlan product</p>
        <h1 id="product-hero-title" className={styles.title}>
          {HEADLINE.map((line) => (
            <span key={line.join(' ')} className={styles.line}>
              {line.map((word) => (
                <span
                  key={word}
                  className={`${styles.word} ${ACCENT_WORDS.has(word) ? styles.accent : ''}`}
                  style={{ '--w': wordIndex++ } as CSSProperties}
                >
                  {word}
                </span>
              ))}
            </span>
          ))}
        </h1>
        <p className={styles.subtitle}>
          Your calendar, your tasks, and an assistant that finds real free time. BPlan keeps the day
          clear, conflict-free, and easy to change.
        </p>
        <div className={styles.actions}>
          <Link className={styles.primary} to="/login">
            Get started free
          </Link>
          <Link className={styles.secondary} to="/pricing">
            See pricing
            <ArrowGlyph />
          </Link>
        </div>
      </div>

      <div ref={stageRef} className={styles.stage} data-revealed={revealed} aria-hidden="true">
        <div className={`${demo.surface} ${styles.board}`}>
          <CalendarMorph mode="week" revealed={revealed} />
        </div>

        <div className={`${demo.surface} ${styles.float} ${styles.upNext}`}>
          <span className={styles.status}>
            <i /> Free now
          </span>
          <strong>Lunch with Maya</strong>
          <span className={styles.muted}>in 1 h 20 m · 1:00 PM</span>
          <span className={styles.dayBar}>
            <i style={{ left: '10%', width: '5%', background: '#B2E0EF' }} />
            <i style={{ left: '20%', width: '15%', background: '#C9B1F4' }} />
            <i style={{ left: '50%', width: '10%', background: '#FBBE7E' }} />
            <i style={{ left: '65%', width: '10%', background: '#FAB2C3' }} />
            <b style={{ left: '36.7%' }} />
          </span>
        </div>

        <div className={`${demo.surface} ${styles.float} ${styles.findTime}`}>
          <span className={styles.findLabel}>
            <SparkGlyph /> Find time
          </span>
          <span className={styles.query}>30 min with Sam this week</span>
          <span className={styles.slot}>
            <span>
              <strong>Wed · 2:00 – 2:30 PM</strong>
              <span className={styles.muted}>Clear afternoon, no back-to-backs</span>
            </span>
            <span className={demo.chip}>Book</span>
          </span>
        </div>

        <div className={`${demo.surface} ${styles.float} ${styles.task}`}>
          <span className={styles.check} />
          <span className={styles.taskTitle}>Send launch notes</span>
          <span className={styles.flag}>High</span>
        </div>
      </div>
    </section>
  );
}

function ArrowGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8h9m-3.5-3.5L12.5 8 9 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
