import { useEffect, useRef, useState } from 'react';

import type { EventOccurrence } from './useCalendarWindow';
import type { MinuteInterval } from '../utils/event-resize';

export const SETTLE_ANIMATION_MS = 180;
export const GHOST_EXIT_ANIMATION_MS = 140;

export interface TimelineSnapDirection {
  key: string;
  direction: 'left' | 'right';
  id: number;
}

export interface TimelineMagneticSnap {
  dateKey: string;
  minute: number;
  edge: 'start' | 'end';
}

export interface TimelineExitingGhost {
  occurrence: EventOccurrence;
  dateKey: string;
  originalMinutes: MinuteInterval;
  originalLayout: { left: number; width: number };
}

/**
 * Visual feedback shared by the timeline's move and resize gestures: the
 * magnetic guide, the conflict flag, the column-change nudge, the settle pulse
 * after a drop, the origin ghost fading out, and the click that a gesture's
 * pointer-up must not turn into a select.
 *
 * Every action touches only refs and state setters, so a closure captured on
 * the first render (the Escape listener) behaves the same as a fresh one.
 */
export function useTimelineGestureFeedback() {
  const [snapDirection, setSnapDirection] = useState<TimelineSnapDirection | null>(null);
  const [magneticSnap, setMagneticSnap] = useState<TimelineMagneticSnap | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  const [settledOccurrenceKey, setSettledOccurrenceKey] = useState<string | null>(null);
  const [exitingGhost, setExitingGhost] = useState<TimelineExitingGhost | null>(null);
  const ghostExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressedClickKeyRef = useRef<string | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExitingGhost = () => {
    if (ghostExitTimerRef.current) {
      clearTimeout(ghostExitTimerRef.current);
      ghostExitTimerRef.current = null;
    }
    setExitingGhost(null);
  };

  /** Shows the origin ghost fading out, restarting its exit timer. */
  const showExitingGhost = (ghost: TimelineExitingGhost) => {
    setExitingGhost(ghost);
    if (ghostExitTimerRef.current) {
      clearTimeout(ghostExitTimerRef.current);
    }
    ghostExitTimerRef.current = setTimeout(() => {
      ghostExitTimerRef.current = null;
      setExitingGhost(null);
    }, GHOST_EXIT_ANIMATION_MS);
  };

  const triggerSettle = (occurrenceKey: string) => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setSettledOccurrenceKey(occurrenceKey);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setSettledOccurrenceKey((current) => (current === occurrenceKey ? null : current));
    }, SETTLE_ANIMATION_MS);
  };

  const clearSettle = () => {
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setSettledOccurrenceKey(null);
  };

  /** Marks the next select of `occurrenceKey` as the tail of a gesture. */
  const suppressClick = (occurrenceKey: string) => {
    suppressedClickKeyRef.current = occurrenceKey;
  };

  /** Drops the suppression on the next tick, unless another gesture has replaced it. */
  const releaseSuppressedClickSoon = (occurrenceKey: string) => {
    globalThis.setTimeout(() => {
      if (suppressedClickKeyRef.current === occurrenceKey) suppressedClickKeyRef.current = null;
    }, 0);
  };

  /** Consumes the suppression: true once for the suppressed key, then false. */
  const shouldSuppressSelect = (occurrenceKey: string) => {
    if (suppressedClickKeyRef.current !== occurrenceKey) return false;
    suppressedClickKeyRef.current = null;
    return true;
  };

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
      }
      if (ghostExitTimerRef.current) {
        clearTimeout(ghostExitTimerRef.current);
      }
    };
  }, []);

  return {
    magneticSnap,
    hasConflict,
    snapDirection,
    settledOccurrenceKey,
    exitingGhost,
    setMagneticSnap,
    setHasConflict,
    setSnapDirection,
    triggerSettle,
    clearSettle,
    clearExitingGhost,
    showExitingGhost,
    suppressClick,
    releaseSuppressedClickSoon,
    shouldSuppressSelect,
  };
}

export type TimelineGestureFeedback = ReturnType<typeof useTimelineGestureFeedback>;
