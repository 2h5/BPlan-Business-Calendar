import { useLayoutEffect } from 'react';
import { useNavigationType } from 'react-router-dom';

/**
 * The router keeps the window's scroll position across route changes, so a
 * link near the bottom of one public page would open the next one at the
 * same depth. Start fresh pages at the top; leave back/forward (POP) alone
 * so the browser can restore where the visitor was.
 */
export function useScrollToTopOnEnter() {
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
    // Only on entry: the page mounts once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
