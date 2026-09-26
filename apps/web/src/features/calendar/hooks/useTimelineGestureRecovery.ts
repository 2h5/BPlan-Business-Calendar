import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';

import type { TimelineAutoScroll } from './useTimelineAutoScroll';
import type { TimelineGestureFeedback } from './useTimelineGestureFeedback';
import type { TimelineActiveMove, TimelineMovePreview, useTimelineMove } from './useTimelineMove';
import type {
  TimelineActiveResize,
  TimelineResizePreview,
  useTimelineResize,
} from './useTimelineResize';

type MoveGesture = ReturnType<typeof useTimelineMove>;
type ResizeGesture = ReturnType<typeof useTimelineResize>;

/** The gesture functions the window fallback reads at event time. */
export interface TimelineRecoveryHandlers {
  applyMovePosition: MoveGesture['applyMovePosition'];
  applyResizePosition: ResizeGesture['applyResizePosition'];
  checkAndTriggerAutoScroll: TimelineAutoScroll['checkAndTriggerAutoScroll'];
  finishMove: MoveGesture['finishMove'];
  finishResize: ResizeGesture['finishResize'];
}

export interface TimelineWindowPointerFallbackDeps {
  scrollRef: RefObject<HTMLDivElement | null>;
  resizeRef: RefObject<TimelineActiveResize | null>;
  moveRef: RefObject<TimelineActiveMove | null>;
  moveHandlersRef: RefObject<TimelineRecoveryHandlers>;
  trackPointer: TimelineAutoScroll['trackPointer'];
}

export interface TimelineEscapeKeyDeps
  extends
    Pick<
      TimelineGestureFeedback,
      | 'setMagneticSnap'
      | 'setHasConflict'
      | 'setSnapDirection'
      | 'showExitingGhost'
      | 'suppressClick'
      | 'releaseSuppressedClickSoon'
    >,
    Pick<TimelineAutoScroll, 'stopAutoScroll' | 'clearPointer'> {
  resizeRef: RefObject<TimelineActiveResize | null>;
  moveRef: RefObject<TimelineActiveMove | null>;
  setResizePreview: Dispatch<SetStateAction<TimelineResizePreview | null>>;
  setMovePreview: Dispatch<SetStateAction<TimelineMovePreview | null>>;
}

export interface UseTimelineGestureRecoveryOptions
  extends TimelineRecoveryHandlers, Omit<TimelineEscapeKeyDeps, 'resizeRef' | 'moveRef'> {
  resizeRef: RefObject<TimelineActiveResize | null>;
  moveRef: RefObject<TimelineActiveMove | null>;
  trackPointer: TimelineAutoScroll['trackPointer'];
}

/**
 * The window pointer listeners that finish or continue a gesture when the
 * event element loses pointer capture. Exported so they can be tested without
 * a DOM; `useTimelineGestureRecovery` builds them once and registers them.
 */
export function createWindowPointerFallback({
  scrollRef,
  resizeRef,
  moveRef,
  moveHandlersRef,
  trackPointer,
}: TimelineWindowPointerFallbackDeps) {
  // The event element normally holds pointer capture and handles these itself
  // (stopping propagation). These window listeners take over if capture is
  // lost, so a gesture can never outlive the mouse button being held.
  const onWindowPointerMove = (e: PointerEvent) => {
    const resize = resizeRef.current;
    if (resize && resize.pointerId === e.pointerId) {
      if (e.buttons === 0) {
        // The release happened somewhere we never heard about.
        moveHandlersRef.current.finishResize(e, false);
        return;
      }
      trackPointer(e.clientX, e.clientY);
      const scrollTop = scrollRef.current?.scrollTop ?? resize.initialScrollTop;
      moveHandlersRef.current.applyResizePosition(e.clientY, scrollTop);
      moveHandlersRef.current.checkAndTriggerAutoScroll();
      return;
    }

    const active = moveRef.current;
    if (!active || active.status !== 'dragging' || active.pointerId !== e.pointerId) return;
    if (e.buttons === 0) {
      moveHandlersRef.current.finishMove(e, false);
      return;
    }
    trackPointer(e.clientX, e.clientY);
    const currentScrollTop = scrollRef.current?.scrollTop ?? active.initialScrollTop;
    moveHandlersRef.current.applyMovePosition(e.clientX, e.clientY, currentScrollTop);
    moveHandlersRef.current.checkAndTriggerAutoScroll();
  };

  const onWindowPointerUp = (e: PointerEvent) => {
    if (resizeRef.current?.pointerId === e.pointerId) {
      moveHandlersRef.current.finishResize(e, false);
      return;
    }
    const active = moveRef.current;
    if (!active || active.status !== 'dragging' || active.pointerId !== e.pointerId) return;
    moveHandlersRef.current.finishMove(e, false);
  };

  const onWindowPointerCancel = (e: PointerEvent) => {
    if (resizeRef.current?.pointerId === e.pointerId) {
      moveHandlersRef.current.finishResize(e, true);
      return;
    }
    const active = moveRef.current;
    if (!active || active.status !== 'dragging' || active.pointerId !== e.pointerId) return;
    moveHandlersRef.current.finishMove(e, true);
  };

  return { onWindowPointerMove, onWindowPointerUp, onWindowPointerCancel };
}

/**
 * The Escape listener that cancels a dragging move, or else an active resize.
 * Exported so it can be tested without a DOM; `useTimelineGestureRecovery`
 * builds it once and registers it.
 */
export function createEscapeKeyHandler({
  resizeRef,
  moveRef,
  setResizePreview,
  setMovePreview,
  setMagneticSnap,
  setHasConflict,
  setSnapDirection,
  showExitingGhost,
  suppressClick,
  releaseSuppressedClickSoon,
  stopAutoScroll,
  clearPointer,
}: TimelineEscapeKeyDeps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      stopAutoScroll();
      clearPointer();
      if (moveRef.current?.status === 'dragging') {
        const active = moveRef.current;
        try {
          active.button.releasePointerCapture(active.pointerId);
        } catch {
          // ignore
        }
        moveRef.current = null;
        setMovePreview(null);
        setMagneticSnap(null);
        setHasConflict(false);
        setSnapDirection(null);
        showExitingGhost({
          occurrence: active.occurrence,
          dateKey: active.originalDateKey,
          originalMinutes: active.originalMinutes,
          originalLayout: active.originalLayout,
        });
        const suppressedKey = active.occurrence.key;
        suppressClick(suppressedKey);
        releaseSuppressedClickSoon(suppressedKey);
      } else if (resizeRef.current) {
        const active = resizeRef.current;
        try {
          active.handle.releasePointerCapture(active.pointerId);
        } catch {
          // ignore
        }
        resizeRef.current = null;
        setResizePreview(null);
        setMagneticSnap(null);
        setHasConflict(false);
        const suppressedKey = active.occurrence.key;
        suppressClick(suppressedKey);
        releaseSuppressedClickSoon(suppressedKey);
      }
    }
  };

  return handleKeyDown;
}

/**
 * Gesture recovery for the timeline: the latest-handler ref, the window
 * pointer fallback and Escape. Both listeners are registered once with the
 * first render's refs and actions; the fallback reads the gesture functions
 * from `moveHandlersRef` at event time.
 */
export function useTimelineGestureRecovery(
  scrollRef: RefObject<HTMLDivElement | null>,
  {
    resizeRef,
    moveRef,
    setResizePreview,
    setMovePreview,
    applyMovePosition,
    applyResizePosition,
    checkAndTriggerAutoScroll,
    finishMove,
    finishResize,
    setMagneticSnap,
    setHasConflict,
    setSnapDirection,
    showExitingGhost,
    suppressClick,
    releaseSuppressedClickSoon,
    stopAutoScroll,
    trackPointer,
    clearPointer,
  }: UseTimelineGestureRecoveryOptions,
): void {
  const moveHandlersRef = useRef({
    applyMovePosition,
    applyResizePosition,
    checkAndTriggerAutoScroll,
    finishMove,
    finishResize,
  });
  useEffect(() => {
    moveHandlersRef.current = {
      applyMovePosition,
      applyResizePosition,
      checkAndTriggerAutoScroll,
      finishMove,
      finishResize,
    };
  });

  useEffect(() => {
    const { onWindowPointerMove, onWindowPointerUp, onWindowPointerCancel } =
      createWindowPointerFallback({ scrollRef, resizeRef, moveRef, moveHandlersRef, trackPointer });

    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
    };
    // Registered once; handlers are read from `moveHandlersRef`. `trackPointer` only
    // writes a ref, so the first render's copy behaves the same as later ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = createEscapeKeyHandler({
      resizeRef,
      moveRef,
      setResizePreview,
      setMovePreview,
      setMagneticSnap,
      setHasConflict,
      setSnapDirection,
      showExitingGhost,
      suppressClick,
      releaseSuppressedClickSoon,
      stopAutoScroll,
      clearPointer,
    });
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // Registered once. The gesture-feedback and auto-scroll actions it calls only touch
    // refs and state setters, so the first render's copies behave the same as later ones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
