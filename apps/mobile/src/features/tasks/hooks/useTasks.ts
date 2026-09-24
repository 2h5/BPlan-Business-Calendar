import { type NextTaskDue, nextTaskDue } from '@cal/domain';
import type { CreateTaskInput, Task, UpdateTaskInput } from '@cal/schemas';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo } from 'react';

import { queryKeys } from '../../../lib/query/query-client';
import { useUndoStore } from '../../../store/undo.store';
import { useAuth, useRequiredUserId } from '../../auth';
import { useUserTimeZone } from '../../settings/hooks/useProfile';
import {
  type TaskWithTags,
  createTask,
  createTaskList,
  deleteTask,
  deleteTaskList,
  fetchTags,
  fetchTask,
  fetchTaskLists,
  fetchTasks,
  setTaskCompleted,
  snoozeTask,
  updateTask,
} from '../api/tasks.api';

/**
 * Task server state.
 *
 * Everything reads from one cached collection keyed by `openOnly`. Mutations
 * update that cache optimistically — completing a task has to feel instant —
 * and then invalidate so the server's version wins on settle.
 */

export function useTasks(options?: { openOnly?: boolean }) {
  const { isAuthenticated } = useAuth();
  const openOnly = options?.openOnly ?? false;
  const hiddenTaskIds = useUndoStore((state) => state.hiddenTaskIds);

  // Tasks whose delete is still undoable stay in the cache but out of view.
  const select = useMemo(
    () =>
      hiddenTaskIds.length === 0
        ? undefined
        : (tasks: TaskWithTags[]) => tasks.filter((task) => !hiddenTaskIds.includes(task.id)),
    [hiddenTaskIds],
  );

  return useQuery({
    queryKey: queryKeys.tasks.list(openOnly),
    queryFn: () => fetchTasks({ openOnly }),
    enabled: isAuthenticated,
    select,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.detail(id ?? 'none'),
    queryFn: () => fetchTask(id as string),
    enabled: !!id,
  });
}

export function useTaskLists() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.tasks.lists(),
    queryFn: fetchTaskLists,
    enabled: isAuthenticated,
  });
}

export function useTags() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.tasks.tags(),
    queryFn: fetchTags,
    enabled: isAuthenticated,
  });
}

/** Invalidate every task collection, whatever its `openOnly` flag. */
function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
}

export function useCreateTask() {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input, userId),
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onSettled: () => void invalidate(),
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateTaskInput) => updateTask(input),
    onSuccess: (task) => {
      queryClient.setQueryData(queryKeys.tasks.detail(task.id), task);
    },
    onSettled: () => void invalidate(),
  });
}

/** Where a completed repeating task moves; null when it just completes. */
function nextDueOf(task: Task, timeZone: string): NextTaskDue | null {
  if (!task.recurrenceRule || !task.dueAt) return null;
  return nextTaskDue(
    {
      dueAt: new Date(task.dueAt),
      hasDueTime: task.hasDueTime,
      recurrenceRule: task.recurrenceRule,
      timeZone,
    },
    new Date(),
  );
}

interface ToggleVariables {
  id: string;
  completed: boolean;
  /**
   * The optimistic move, resolved from the cache before the optimistic update
   * rewrites the cached due date. `null` when the cached task does not repeat;
   * `undefined` when it was not cached, as when a reminder's "Complete" action
   * cold-starts the app. The request itself always re-reads a repeating task.
   */
  next?: NextTaskDue | null;
}

/**
 * Completion is the most-used action in the app, so it is fully optimistic:
 * the row updates and the haptic fires before the request is even sent.
 *
 * Completing a repeating task moves it to its next due date and leaves it
 * open, rather than completing it — until its series runs out.
 */
export function useToggleTaskComplete() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTasks();
  const timeZone = useUserTimeZone();

  const mutation = useMutation({
    mutationFn: async ({ id, completed, next }: ToggleVariables) => {
      // A task the cache knows does not repeat completes directly. Anything
      // that may repeat is re-read first: the move is worked out from the
      // stored rule, never a cached copy that another device may have changed.
      if (!completed || next === null) return setTaskCompleted(id, completed);

      const stored = await fetchTask(id);
      const advance = nextDueOf(stored, timeZone);
      if (!advance) return setTaskCompleted(id, true);

      return updateTask({
        id,
        dueAt: advance.dueAt.toISOString(),
        // Only a COUNT changes the rule; otherwise leave the column untouched.
        ...(advance.recurrenceRule !== stored.recurrenceRule
          ? { recurrenceRule: advance.recurrenceRule }
          : {}),
      });
    },

    onMutate: async ({ id, completed, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all() });

      void Haptics.impactAsync(
        completed ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      );

      const snapshots = queryClient.getQueriesData<TaskWithTags[]>({
        queryKey: queryKeys.tasks.all(),
      });

      const patch = (task: TaskWithTags): TaskWithTags =>
        completed && next
          ? { ...task, dueAt: next.dueAt.toISOString(), recurrenceRule: next.recurrenceRule }
          : {
              ...task,
              status: completed ? 'completed' : 'open',
              completedAt: completed ? new Date().toISOString() : null,
            };

      for (const [key, tasks] of snapshots) {
        if (!Array.isArray(tasks)) continue;
        queryClient.setQueryData<TaskWithTags[]>(
          key,
          tasks.map((task) => (task.id === id ? patch(task) : task)),
        );
      }

      return { snapshots };
    },

    onError: (_error, _variables, context) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: () => void invalidate(),
  });

  const { mutate: mutateResolved } = mutation;
  const mutate = useCallback(
    ({ id, completed }: { id: string; completed: boolean }) => {
      const cached = completed ? findCachedTask(queryClient, id) : null;
      mutateResolved({
        id,
        completed,
        next: completed ? (cached ? nextDueOf(cached, timeZone) : undefined) : null,
      });
    },
    [mutateResolved, queryClient, timeZone],
  );

  return { ...mutation, mutate };
}

function findCachedTask(queryClient: QueryClient, id: string): TaskWithTags | null {
  const collections = queryClient.getQueriesData<TaskWithTags[]>({
    queryKey: queryKeys.tasks.all(),
  });
  for (const [, tasks] of collections) {
    if (!Array.isArray(tasks)) continue;
    const task = tasks.find((candidate) => candidate.id === id);
    if (task) return task;
  }
  return null;
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.all() });
      const snapshots = queryClient.getQueriesData<TaskWithTags[]>({
        queryKey: queryKeys.tasks.all(),
      });

      for (const [key, tasks] of snapshots) {
        if (!Array.isArray(tasks)) continue;
        queryClient.setQueryData<TaskWithTags[]>(
          key,
          tasks.filter((task) => task.id !== id),
        );
      }

      return { snapshots };
    },

    onError: (_error, _id, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
    },

    onSettled: () => void invalidate(),
  });
}

export function useSnoozeTask() {
  const invalidate = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, dueAt, hasDueTime }: { id: string; dueAt: Date; hasDueTime: boolean }) =>
      snoozeTask(id, dueAt, hasDueTime),
    onSuccess: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    onSettled: () => void invalidate(),
  });
}

export function useCreateTaskList() {
  const userId = useRequiredUserId();
  const queryClient = useQueryClient();
  const { data: lists } = useTaskLists();

  return useMutation({
    mutationFn: (input: { name: string; color: string }) =>
      createTaskList(input, userId, lists?.length ?? 0),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
    },
  });
}

export function useDeleteTaskList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTaskList(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.lists() });
      // Tasks in the deleted list fall back to the inbox, so they change too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    },
  });
}
