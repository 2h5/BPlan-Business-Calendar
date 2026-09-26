/** Short enough to feel like a snap, long enough to show where the view went. */
export const SWIFT_SCROLL_MS = 260;

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Scrolls an element to `top` over a fixed, short duration. Native smooth
 * scrolling scales with distance, which drags on long jumps across the day.
 * A user scroll (wheel or touch) cancels the animation so it never fights them.
 */
export function animateScrollTop(
  element: HTMLElement,
  top: number,
  durationMs = SWIFT_SCROLL_MS,
): void {
  const start = element.scrollTop;
  const distance = top - start;
  if (distance === 0) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion || durationMs <= 0) {
    element.scrollTop = top;
    return;
  }

  let frame = 0;
  const cancel = () => {
    cancelAnimationFrame(frame);
    element.removeEventListener('wheel', cancel);
    element.removeEventListener('touchstart', cancel);
  };
  element.addEventListener('wheel', cancel, { passive: true });
  element.addEventListener('touchstart', cancel, { passive: true });

  const startedAt = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - startedAt) / durationMs, 1);
    element.scrollTop = start + distance * easeOutCubic(progress);
    if (progress < 1) frame = requestAnimationFrame(step);
    else cancel();
  };
  frame = requestAnimationFrame(step);
}
