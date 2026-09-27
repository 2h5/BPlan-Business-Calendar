import { useCallback, useEffect, useRef, useState } from 'react';

import type { CalendarViewMode } from '../utils/calendar-window';
import {
  getTransitionOrigin,
  getViewTransitionDirection,
  type ViewTransitionState,
} from '../utils/view-transition';

interface CalendarViewTransitionInput {
  fromMode: CalendarViewMode;
  toMode: CalendarViewMode;
  selectedDateKey: string;
  targetDateKey?: string;
  timeZone: string;
  weekStartsOn: number;
  dateKeys: readonly string[];
}

export function useCalendarViewTransition() {
  const [transitionState, setTransitionState] = useState<ViewTransitionState | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTransition = useCallback(
    ({
      fromMode,
      toMode,
      selectedDateKey,
      targetDateKey,
      timeZone,
      weekStartsOn,
      dateKeys,
    }: CalendarViewTransitionInput) => {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      const direction = getViewTransitionDirection(fromMode, toMode);
      if (direction && !prefersReducedMotion) {
        const origin = getTransitionOrigin({
          fromMode,
          toMode,
          selectedDateKey: targetDateKey ?? selectedDateKey,
          timeZone,
          weekStartsOn,
          dateKeys,
        });
        setTransitionState({ direction, origin });

        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = setTimeout(() => {
          setTransitionState(null);
          transitionTimerRef.current = null;
        }, 240);
      } else {
        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
          transitionTimerRef.current = null;
        }
        setTransitionState(null);
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  return { transitionState, startTransition };
}
