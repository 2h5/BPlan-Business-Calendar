import { useEffect, useRef, useState, type RefObject } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED_MOTION).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION);
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}

/**
 * Tracks whether an element is on screen. `revealed` latches the first time
 * it enters (for one-shot entrance choreography); `visible` follows it in and
 * out so looping demos only run while someone can see them.
 */
export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { threshold = 0.25, rootMargin = '0px 0px -8% 0px' } = {},
) {
  const [state, setState] = useState({ revealed: false, visible: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setState((previous) => ({
          revealed: previous.revealed || entry.isIntersecting,
          visible: entry.isIntersecting,
        }));
      },
      { threshold, rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin]);

  return state;
}

/**
 * Steps through a scripted demo: each entry is how long that step holds
 * before the next, looping back to the start. Pauses (keeping its place)
 * while `playing` is false.
 */
export function useSequence(durations: readonly number[], playing: boolean): number {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!playing) return undefined;
    const hold = durations[step] ?? 1000;
    const timer = window.setTimeout(() => setStep((step + 1) % durations.length), hold);
    return () => window.clearTimeout(timer);
  }, [durations, playing, step]);

  return step;
}

/**
 * A looping clock for continuous motion: calls `onFrame` with the progress
 * through a `periodMs` loop (0–1) on every animation frame while `playing`.
 * The callback writes to the DOM directly, so no React render per frame.
 */
export function useLoopFrame(
  periodMs: number,
  playing: boolean,
  onFrame: (progress: number) => void,
) {
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      elapsedRef.current = (elapsedRef.current + (now - last)) % periodMs;
      last = now;
      onFrameRef.current(elapsedRef.current / periodMs);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [periodMs, playing]);
}

/** How many characters of `text` a typing demo has revealed while `active`. */
export function useTypedCount(text: string, active: boolean, msPerChar = 42): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) {
      setCount(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setCount((previous) => Math.min(previous + 1, text.length));
    }, msPerChar);
    return () => window.clearInterval(timer);
  }, [active, msPerChar, text]);

  return count;
}
