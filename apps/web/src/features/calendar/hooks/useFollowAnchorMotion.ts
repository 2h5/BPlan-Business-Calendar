import { useEffect } from 'react';

import { followAnchorMotion } from '../utils/anchor-motion';

/**
 * Keep a floating element attached to its anchor while the anchor's containers animate
 * (page entrance, calendar view changes). See `followAnchorMotion`.
 *
 * `getAnchor` and `reposition` must be stable (memoised) callbacks.
 */
export function useFollowAnchorMotion(
  enabled: boolean,
  getAnchor: () => Element | null,
  reposition: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;
    return followAnchorMotion(getAnchor, reposition, {
      addEventListener: (type, listener, capture) =>
        document.addEventListener(type, listener, capture),
      removeEventListener: (type, listener, capture) =>
        document.removeEventListener(type, listener, capture),
      requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
      cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    });
  }, [enabled, getAnchor, reposition]);
}
