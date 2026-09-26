import { useEffect, useRef, type RefObject } from 'react';

import { calculateAutoScrollVelocity, clampScrollTop } from '../utils/event-auto-scroll';

export interface UseTimelineAutoScrollOptions {
  /** True while a move gesture has passed its drag threshold. */
  isMoveDragging: () => boolean;
  /** True while a resize gesture is in progress. */
  isResizeActive: () => boolean;
  /** Re-applies the active resize at the pointer after a scroll step. */
  applyResizeAt: (clientY: number, scrollTop: number) => void;
  /** Re-applies the dragging move at the pointer after a scroll step. */
  applyMoveAt: (clientX: number, clientY: number, scrollTop: number) => void;
}

/**
 * Scrolls the timeline while a move or resize is held near its top or bottom
 * edge, re-applying the gesture after each step. Resize wins if both report
 * active.
 *
 * `stepAutoScroll` is a plain per-render function that reschedules itself, so a
 * running loop keeps calling the `applyResizeAt` / `applyMoveAt` of the render
 * that started it. `stopAutoScroll`, `trackPointer` and `clearPointer` touch
 * only refs, so a closure captured on the first render behaves the same as a
 * fresh one.
 */
export function useTimelineAutoScroll(
  scrollRef: RefObject<HTMLDivElement | null>,
  gesture: UseTimelineAutoScrollOptions,
) {
  const autoScrollRafRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

  const stopAutoScroll = () => {
    if (autoScrollRafRef.current !== null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, []);

  /** Records the pointer the next auto-scroll probe and step read. */
  const trackPointer = (clientX: number, clientY: number) => {
    lastPointerRef.current = { clientX, clientY };
  };

  /** Forgets the pointer, so the next probe or step stops the loop. */
  const clearPointer = () => {
    lastPointerRef.current = null;
  };

  const stepAutoScroll = () => {
    const scrollContainer = scrollRef.current;
    const lastPointer = lastPointerRef.current;
    const isMoveActive = gesture.isMoveDragging();
    const isResizeActive = gesture.isResizeActive();

    if (!scrollContainer || !lastPointer || (!isMoveActive && !isResizeActive)) {
      stopAutoScroll();
      return;
    }

    const viewportRect = scrollContainer.getBoundingClientRect();
    const velocity = calculateAutoScrollVelocity(lastPointer.clientY, viewportRect);

    if (velocity === 0) {
      stopAutoScroll();
      return;
    }

    const currentScrollTop = scrollContainer.scrollTop;
    const newScrollTop = clampScrollTop(
      currentScrollTop + velocity,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
    );

    if (newScrollTop === currentScrollTop) {
      stopAutoScroll();
      return;
    }

    scrollContainer.scrollTop = newScrollTop;

    if (isResizeActive && gesture.isResizeActive()) {
      gesture.applyResizeAt(lastPointer.clientY, newScrollTop);
    } else if (isMoveActive && gesture.isMoveDragging()) {
      gesture.applyMoveAt(lastPointer.clientX, lastPointer.clientY, newScrollTop);
    }

    autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
  };

  const checkAndTriggerAutoScroll = () => {
    const scrollContainer = scrollRef.current;
    const lastPointer = lastPointerRef.current;
    const isMoveActive = gesture.isMoveDragging();
    const isResizeActive = gesture.isResizeActive();

    if (!scrollContainer || !lastPointer || (!isMoveActive && !isResizeActive)) {
      stopAutoScroll();
      return;
    }

    const viewportRect = scrollContainer.getBoundingClientRect();
    const velocity = calculateAutoScrollVelocity(lastPointer.clientY, viewportRect);

    if (velocity === 0) {
      stopAutoScroll();
      return;
    }

    const currentScrollTop = scrollContainer.scrollTop;
    const newScrollTop = clampScrollTop(
      currentScrollTop + velocity,
      scrollContainer.scrollHeight,
      scrollContainer.clientHeight,
    );

    if (newScrollTop === currentScrollTop) {
      stopAutoScroll();
      return;
    }

    if (autoScrollRafRef.current === null) {
      autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
    }
  };

  return { stopAutoScroll, checkAndTriggerAutoScroll, trackPointer, clearPointer };
}

export type TimelineAutoScroll = ReturnType<typeof useTimelineAutoScroll>;
