import { addZonedDays, getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { Task } from '@cal/schemas';
import { useCallback } from 'react';

import { useDeleteTask, useSnoozeTask, useToggleTaskComplete } from './useTasks';
import { useTaskEditorStore } from '../../../store/task-editor.store';
import { useUndoStore } from '../../../store/undo.store';
import { useUserTimeZone } from '../../settings/hooks/useProfile';

/**
 * The handful of actions every task list needs, bound once so the inbox and
 * Today cannot drift apart on what "snooze" means.
 */
export function useTaskActions() {
  const timeZone = useUserTimeZone();
  const toggleComplete = useToggleTaskComplete();
  const snooze = useSnoozeTask();
  const remove = useDeleteTask();
  const openTask = useTaskEditorStore((state) => state.openTask);
  const pushUndo = useUndoStore((state) => state.push);
  const hideTask = useUndoStore((state) => state.hideTask);
  const showTask = useUndoStore((state) => state.showTask);

  const onToggleComplete = useCallback(
    (task: Task, completed: boolean) => toggleComplete.mutate({ id: task.id, completed }),
    [toggleComplete],
  );

  /**
   * Snoozing moves a task to tomorrow. A timed task keeps its time of day; a
   * date-only task stays date-only rather than acquiring a spurious time.
   */
  const onSnooze = useCallback(
    (task: Task) => {
      const base = task.dueAt ? new Date(task.dueAt) : new Date();
      const tomorrow = addZonedDays(base, 1, timeZone);
      const parts = getZonedParts(tomorrow, timeZone);
      const existing = task.dueAt ? getZonedParts(new Date(task.dueAt), timeZone) : null;

      const dueAt = zonedWallClockToUtc(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: task.hasDueTime && existing ? existing.hour : 12,
          minute: task.hasDueTime && existing ? existing.minute : 0,
        },
        timeZone,
      );

      snooze.mutate({ id: task.id, dueAt, hasDueTime: task.hasDueTime });
    },
    [snooze, timeZone],
  );

  /**
   * Swipe-to-delete has no confirmation, so it is undoable instead: the row
   * hides at once and the delete is only sent when the undo window closes.
   */
  const { mutateAsync: removeAsync } = remove;
  const onDelete = useCallback(
    (task: Task) => {
      hideTask(task.id);
      pushUndo({
        message: 'Task deleted',
        undo: () => showTask(task.id),
        commit: () => {
          // Unhide once settled: by then the delete's optimistic update has
          // dropped the row from the cache, so it does not flash back.
          void removeAsync(task.id)
            .catch(() => undefined)
            .finally(() => showTask(task.id));
        },
      });
    },
    [hideTask, pushUndo, removeAsync, showTask],
  );

  /**
   * Makes overdue tasks due today, date-only — a time already past today would
   * leave them overdue. Applied at once, with an undo that restores each
   * task's original due date.
   */
  const { mutate: snoozeMutate } = snooze;
  const onMoveToToday = useCallback(
    (tasks: readonly Task[]) => {
      if (tasks.length === 0) return;

      const parts = getZonedParts(new Date(), timeZone);
      // Local noon, so a later time-zone change cannot slide it into another day.
      const today = zonedWallClockToUtc(
        { year: parts.year, month: parts.month, day: parts.day, hour: 12, minute: 0 },
        timeZone,
      );
      const originals = tasks.map((task) => ({
        id: task.id,
        dueAt: task.dueAt,
        hasDueTime: task.hasDueTime,
      }));

      for (const task of tasks) snoozeMutate({ id: task.id, dueAt: today, hasDueTime: false });

      pushUndo({
        message: `Moved ${tasks.length} task${tasks.length === 1 ? '' : 's'} to today`,
        commit: () => undefined,
        undo: () => {
          for (const original of originals) {
            if (!original.dueAt) continue;
            snoozeMutate({
              id: original.id,
              dueAt: new Date(original.dueAt),
              hasDueTime: original.hasDueTime,
            });
          }
        },
      });
    },
    [pushUndo, snoozeMutate, timeZone],
  );

  const onOpenTask = useCallback((task: Task) => openTask(task.id), [openTask]);

  return { onToggleComplete, onSnooze, onDelete, onMoveToToday, onOpenTask };
}
