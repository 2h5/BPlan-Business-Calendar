import { useLayoutEffect, useRef, useState, type AnimationEvent } from 'react';

import styles from './PricingDecals.module.css';

/**
 * How long after the pricing page unmounts the next public page may still
 * treat it as "just left". Anything later is a stale flag (e.g. an authed
 * visitor redirected elsewhere first) and must not replay the exit.
 */
const EXIT_HANDOFF_MS = 1000;

let pricingLeftAt: number | null = null;

interface PricingDecalsProps {
  mode: 'enter' | 'exit';
  /** Called once the exit animation has finished (exit mode only). */
  onExited?: () => void;
}

/**
 * The soft background pills on the pricing page. In `enter` mode they drift
 * in; in `exit` mode they play the same motion in reverse so a page reached
 * from pricing can let them leave instead of vanishing on route change.
 */
export function PricingDecals({ mode, onExited }: PricingDecalsProps) {
  const rightRef = useRef<HTMLDivElement>(null);

  // Layout-effect cleanups of the outgoing route run before the incoming
  // route's layout effects in the same commit, so the next page sees this.
  useLayoutEffect(() => {
    if (mode !== 'enter') return undefined;
    pricingLeftAt = null;
    return () => {
      pricingLeftAt = performance.now();
    };
  }, [mode]);

  // The right-hand pill is the last to finish leaving.
  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (mode === 'exit' && event.target === rightRef.current && !event.pseudoElement) {
      onExited?.();
    }
  };

  return (
    <div
      className={`${styles.decals} ${mode === 'exit' ? styles.exit : ''}`}
      aria-hidden="true"
      onAnimationEnd={handleAnimationEnd}
    >
      <div className={styles.leftShapes} />
      <div ref={rightRef} className={styles.rightShapes} />
    </div>
  );
}

/**
 * True when this page was reached straight from the pricing page, until the
 * returned `onExited` is called after the decals have animated out.
 */
export function usePricingDecalsExit() {
  const [isExiting, setIsExiting] = useState(false);

  useLayoutEffect(() => {
    const leftAt = pricingLeftAt;
    pricingLeftAt = null;
    if (leftAt !== null && performance.now() - leftAt < EXIT_HANDOFF_MS) {
      setIsExiting(true);
    }
  }, []);

  return { isExiting, onExited: () => setIsExiting(false) };
}
