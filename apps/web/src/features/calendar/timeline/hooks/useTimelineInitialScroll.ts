import { useEffect, useRef, type RefObject } from 'react';

import { initialScrollHour, type InitialScrollInput } from '../utils/timeline-initial-scroll';

export interface UseTimelineInitialScrollOptions extends InitialScrollInput {
  hourHeight: number;
}

/**
 * Scrolls the timeline to its starting hour whenever the visible days, hour
 * height, time zone or today changes. Re-renders with the same key (new
 * events, a ticking `now`) leave the scroll position alone.
 */
export function useTimelineInitialScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  {
    dateKeys,
    byDateKey,
    revealEventId,
    todayKey,
    now,
    timeZone,
    hourHeight,
  }: UseTimelineInitialScrollOptions,
) {
  const initialScrollKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const scrollKey = `${dateKeys.join('|')}::${hourHeight}::${timeZone}::${todayKey}`;
    if (initialScrollKeyRef.current === scrollKey) return;
    initialScrollKeyRef.current = scrollKey;

    // Runs before the parent opens a linked event's card, so the card measures an on-screen block.
    const initialHour = initialScrollHour({
      dateKeys,
      byDateKey,
      revealEventId,
      todayKey,
      now,
      timeZone,
    });
    scrollRef.current?.scrollTo({ top: initialHour * hourHeight });
    // `scrollRef` is TimelineView's own stable ref; listing it never re-runs the effect.
  }, [byDateKey, dateKeys, hourHeight, now, revealEventId, scrollRef, timeZone, todayKey]);
}
