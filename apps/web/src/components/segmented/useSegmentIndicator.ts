import { useLayoutEffect, useRef } from 'react';

/** Matches the selected option, whichever ARIA pattern the group uses. */
const ACTIVE_OPTION =
  ':scope > [aria-checked="true"], :scope > [aria-pressed="true"], :scope > [aria-selected="true"]';

/**
 * Tracks the selected option of a segmented control so a `SegmentIndicator`
 * can glide to it. The option's box is written to CSS variables on the
 * container; the indicator reads them, so a change of selection or size only
 * transitions a transform and a width, never a React re-render per frame.
 *
 * `activeKey` is whatever identifies the selection; the container must be
 * `position: relative` (the indicator's styles assume its padding box).
 */
export function useSegmentIndicator<T extends HTMLElement>(activeKey: unknown) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(ACTIVE_OPTION);
      if (!active) {
        container.removeAttribute('data-segment-selected');
        return;
      }
      container.style.setProperty('--segment-x', `${active.offsetLeft}px`);
      container.style.setProperty('--segment-y', `${active.offsetTop}px`);
      container.style.setProperty('--segment-width', `${active.offsetWidth}px`);
      container.style.setProperty('--segment-height', `${active.offsetHeight}px`);
      container.setAttribute('data-segment-selected', '');
    };

    // The first placement snaps; once the pill has been painted somewhere,
    // later moves animate from there.
    if (container.style.getPropertyValue('--segment-x')) {
      container.setAttribute('data-segment-ready', '');
    }
    measure();

    // Labels, counts, fonts, and layout can all resize the options.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const child of Array.from(container.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [activeKey]);

  return ref;
}
