import { useCallback, useEffect, useRef, useState } from 'react';

interface CalendarToast {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Minimum time a held toast stays after the pointer or focus leaves it. */
const TOAST_RESUME_GRACE_MS = 1500;

export function useCalendarToast() {
  const [toast, setToast] = useState<CalendarToast | null>(null);
  const [isToastExiting, setIsToastExiting] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastDeadlineRef = useRef(0);
  const toastRemainingRef = useRef<number | null>(null);
  const isToastHeldRef = useRef(false);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      globalThis.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (toastExitTimerRef.current) {
      globalThis.clearTimeout(toastExitTimerRef.current);
      toastExitTimerRef.current = null;
    }
    toastRemainingRef.current = null;
    setIsToastExiting(true);
    toastExitTimerRef.current = globalThis.setTimeout(() => {
      // Unmounting under the pointer never fires pointerleave; drop the hold here.
      isToastHeldRef.current = false;
      setToast(null);
      setIsToastExiting(false);
      toastExitTimerRef.current = null;
    }, 180);
  }, []);

  const scheduleToastDismiss = useCallback(
    (duration: number) => {
      if (toastTimerRef.current) globalThis.clearTimeout(toastTimerRef.current);
      toastRemainingRef.current = duration;
      toastDeadlineRef.current = Date.now() + duration;
      // While the pointer or focus is on the toast (for example, deciding on
      // Undo) it stays put; the countdown resumes when they leave.
      toastTimerRef.current = isToastHeldRef.current
        ? null
        : globalThis.setTimeout(dismissToast, duration);
    },
    [dismissToast],
  );

  const showToast = useCallback(
    (nextToast: CalendarToast, duration = 6000) => {
      if (toastExitTimerRef.current) {
        globalThis.clearTimeout(toastExitTimerRef.current);
        toastExitTimerRef.current = null;
      }
      setToast(nextToast);
      setIsToastExiting(false);
      scheduleToastDismiss(duration);
    },
    [scheduleToastDismiss],
  );

  const holdToast = useCallback(() => {
    if (isToastHeldRef.current) return;
    isToastHeldRef.current = true;
    if (!toastTimerRef.current) return;
    globalThis.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
    toastRemainingRef.current = Math.max(0, toastDeadlineRef.current - Date.now());
  }, []);

  const releaseToast = useCallback(() => {
    if (!isToastHeldRef.current) return;
    isToastHeldRef.current = false;
    const remaining = toastRemainingRef.current;
    // A short grace period so the toast never vanishes the instant they move away.
    if (remaining !== null) scheduleToastDismiss(Math.max(remaining, TOAST_RESUME_GRACE_MS));
  }, [scheduleToastDismiss]);

  const showSuccess = useCallback((message: string) => showToast({ message }, 3000), [showToast]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) globalThis.clearTimeout(toastTimerRef.current);
      if (toastExitTimerRef.current) globalThis.clearTimeout(toastExitTimerRef.current);
    },
    [],
  );

  return { toast, setToast, isToastExiting, showToast, showSuccess, holdToast, releaseToast };
}
