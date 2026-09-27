import { useEffect, useRef, useState } from 'react';

import styles from './FindTimeRotatingPrompt.module.css';
import {
  createCyclingSequence,
  createFindTimePromptSequence,
  type Random,
} from '../utils/find-time-prompts';

export interface PromptRotationControllerOptions {
  intervalMs: number;
  transitionMs: number;
  onAdvance: () => void;
  onTransitionEnd: () => void;
  isDocumentHidden?: () => boolean;
}

/**
 * Controller for coordinating rotation ticks, slide transitions, visibility pausing,
 * and timer cleanup without tight coupling to the DOM rendering engine.
 */
export function startPromptRotation({
  intervalMs,
  transitionMs,
  onAdvance,
  onTransitionEnd,
  isDocumentHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
}: PromptRotationControllerOptions): () => void {
  let transitionTimer: ReturnType<typeof setTimeout> | null = null;

  const intervalTimer = setInterval(() => {
    if (isDocumentHidden()) {
      return;
    }

    onAdvance();

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
  /** A fixed list to cycle instead of the generated examples. */
  examples?: readonly string[];
  intervalMs?: number;
  transitionMs?: number;
  random?: Random;
}

type PromptState = { step: number; current: string; previous: string | null };

/**
 * A calm, rotating suggestion prompt for the empty Find Time input.
 * "Try" remains fixed as the lead-in while generated examples rotate smoothly.
 * Pointer-events are disabled so clicks pass through seamlessly to the real input.
 * Decorative only; aria-hidden ensures screen readers rely on the input's stable accessible name.
 */
export function FindTimeRotatingPrompt({
  examples,
  intervalMs = 3600,
  transitionMs = 260,
  random,
}: FindTimeRotatingPromptProps) {
  const nextRef = useRef<(() => string) | null>(null);
  nextRef.current ??= examples
    ? createCyclingSequence(examples)
    : createFindTimePromptSequence(random);

  const [prompt, setPrompt] = useState<PromptState>(() => ({
    step: 0,
    current: nextRef.current?.() ?? '',
    previous: null,
  }));
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const canRotate = !examples || examples.length > 1;

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
    if (prefersReducedMotion || !canRotate) return;

    return startPromptRotation({
      intervalMs,
      transitionMs,
      onAdvance: () => {
        const next = nextRef.current?.() ?? '';
        setPrompt((state) => ({ step: state.step + 1, current: next, previous: state.current }));
      },
      onTransitionEnd: () => {
        setPrompt((state) => ({ ...state, previous: null }));
      },
    });
  }, [canRotate, intervalMs, prefersReducedMotion, transitionMs]);

  if (!prompt.current) return null;

  return (
    <div className={styles.promptOverlay} aria-hidden="true">
      <span className={styles.promptPrefix}>Try</span>
      <span className={styles.promptPhraseTrack}>
        {prompt.previous !== null && (
          <span
            key={`prev-${prompt.step}`}
            className={`${styles.promptPhrase} ${styles.promptPhraseExit}`}
          >
            {prompt.previous}
          </span>
        )}
        <span
          key={`curr-${prompt.step}`}
          className={`${styles.promptPhrase} ${prompt.previous !== null ? styles.promptPhraseEnter : ''}`}
        >
          {prompt.current}
        </span>
      </span>
    </div>
  );
}
