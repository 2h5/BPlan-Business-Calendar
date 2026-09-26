import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Tracks an element's rendered height so a wrapper can transition to it.
 * CSS cannot animate `height: auto`, so the wrapper is given the measured
 * pixel value instead and animates between successive measurements.
 */
export function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    setHeight(element.offsetHeight);
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}
