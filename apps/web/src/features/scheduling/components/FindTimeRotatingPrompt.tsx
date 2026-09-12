import { useEffect, useState } from 'react';

import styles from './FindTimeRotatingPrompt.module.css';

export const FIND_TIME_PROMPT_EXAMPLES: readonly string[] = [
  '“15-minute meeting with Andrew”',
  '“lunch next Friday around noon”',
  '“90 minutes of deep work next week”',
  '“dentist Tuesday at 2”',
  '“hike this Saturday morning”',
  '“dinner Friday at 8”',
] as const;

export interface PromptRotationControllerOptions {
  totalCount: number;
  intervalMs: number;
  transitionMs: number;
  onAdvance: (nextIndex: number, prevIndex: number) => void;
  onTransitionEnd: () => void;
  isDocumentHidden?: () => boolean;
}

/**
 * Controller for coordinating rotation ticks, slide transitions, visibility pausing,
 * and timer cleanup without tight coupling to the DOM rendering engine.
 */
export function startPromptRotation({
  totalCount,
  intervalMs,
  transitionMs,
  onAdvance,
  onTransitionEnd,
  isDocumentHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
}: PromptRotationControllerOptions): () => void {
  if (totalCount <= 1) return () => {};

  let currentIndex = 0;
  let transitionTimer: ReturnType<typeof setTimeout> | null = null;

  const intervalTimer = setInterval(() => {
    if (isDocumentHidden()) {
      return;
    }

    const prev = currentIndex;
    currentIndex = (currentIndex + 1) % totalCount;
    onAdvance(currentIndex, prev);

    if (transitionTimer) {
      clearTimeout(transitionTimer);
    }
    transitionTimer = setTimeout(() => {
      onTransitionEnd();
      transitionTimer = null;
    }, transitionMs);
  }, intervalMs);

  return () => {
    clearInterval(intervalTimer);
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }
  };
}

export interface FindTimeRotatingPromptProps {
  examples?: readonly string[];
  intervalMs?: number;
  transitionMs?: number;
}

/**
 * A calm, rotating suggestion prompt for the empty Find Time input.
 * "Try" remains fixed as the lead-in while realistic examples rotate smoothly.
 * Pointer-events are disabled so clicks pass through seamlessly to the real input.
 * Decorative only; aria-hidden ensures screen readers rely on the input's stable accessible name.
 */
export function FindTimeRotatingPrompt({
  examples = FIND_TIME_PROMPT_EXAMPLES,
  intervalMs = 3600,
  transitionMs = 260,
}: FindTimeRotatingPromptProps) {
  const [index, setIndex] = useState(0);
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    mediaQuery.addEventListener('change', handler);
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion || examples.length <= 1) return;

    return startPromptRotation({
      totalCount: examples.length,
      intervalMs,
      transitionMs,
      onAdvance: (next, prev) => {
        setPrevIndex(prev);
        setIndex(next);
      },
      onTransitionEnd: () => {
        setPrevIndex(null);
      },
    });
  }, [examples.length, intervalMs, prefersReducedMotion, transitionMs]);

  if (examples.length === 0) return null;

  return (
    <div className={styles.promptOverlay} aria-hidden="true">
      <span className={styles.promptPrefix}>Try</span>
      <span className={styles.promptPhraseTrack}>
        {prevIndex !== null && (
          <span
            key={`prev-${prevIndex}`}
            className={`${styles.promptPhrase} ${styles.promptPhraseExit}`}
          >
            {examples[prevIndex]}
          </span>
        )}
        <span
          key={`curr-${index}`}
          className={`${styles.promptPhrase} ${prevIndex !== null ? styles.promptPhraseEnter : ''}`}
        >
          {examples[index]}
        </span>
      </span>
    </div>
  );
}
