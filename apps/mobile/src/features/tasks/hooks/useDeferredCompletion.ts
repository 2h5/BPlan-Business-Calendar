import type { Task } from '@cal/schemas';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** How long a just-ticked task stays in place, struck through, before it is completed. */
export const COMPLETION_UNDO_MS = 3000;

/**
 * Ticking a task on the Tasks screen does not complete it at once: the row
 * stays where it is, struck through with an Undo, and the completion is only
 * sent when the window closes. Sending late rather than reverting afterwards
 * means an undone tick never reaches the server, and the row cannot jump into
 * the completed pile while the user is still looking at it.
 *
 * Anything still pending is committed when the screen unmounts or the app
 * leaves the foreground, so a tick is never silently lost.
 */
export function useDeferredCompletion(commit: (task: Task) => void) {
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; task: Task }>());
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const settle = useCallback((id: string, send: boolean) => {
    const entry = timers.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    timers.current.delete(id);
    setPendingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    if (send) commitRef.current(entry.task);
  }, []);

  const complete = useCallback(
    (task: Task) => {
      if (timers.current.has(task.id)) return;
      const timer = setTimeout(() => settle(task.id, true), COMPLETION_UNDO_MS);
      timers.current.set(task.id, { timer, task });
      setPendingIds((current) => new Set(current).add(task.id));
    },
    [settle],
  );

  const undo = useCallback((id: string) => settle(id, false), [settle]);

  useEffect(() => {
    const flushAll = () => {
      for (const id of [...timers.current.keys()]) settle(id, true);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushAll();
    });
    return () => {
      subscription.remove();
      flushAll();
    };
  }, [settle]);

  return { pendingIds, complete, undo };
}
