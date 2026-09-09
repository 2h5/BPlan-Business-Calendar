import { addZonedDays, getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { CreateTaskInput, UpdateTaskInput } from '@cal/schemas';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { TaskInspector } from './TaskInspector';
import { TaskListPane } from './TaskListPane';
import styles from './TasksView.module.css';
import { useProfile } from '../../settings/hooks/useSettings';
import type { TaskWithTags } from '../api/tasks.api';
import { type TaskFilter, useTaskBuckets } from '../hooks/useTaskBuckets';
import {
  useCreateTask,
  useDeleteTask,
  useSnoozeTask,
  useTags,
  useTaskLists,
  useToggleTaskComplete,
  useUpdateTask,
} from '../hooks/useTasks';

export function TasksView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() =>
    searchParams.get('task'),
  );
  const [isDraft, setIsDraft] = useState(
    () => searchParams.get('new') === 'true' || searchParams.get('newTask') === 'true',
  );
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<TaskFilter>('inbox');
  const [selectedListId, setSelectedListId] = useState<string | null>(() =>
    searchParams.get('list'),
  );
  const { data: profile } = useProfile();

  const { buckets, tasks, timeZone, now, isLoading, isError, refetch } = useTaskBuckets({
    listId: selectedListId,
    filter: activeTab,
    timeZone: profile?.timezone,
  });

  const { data: lists } = useTaskLists();
  const { data: tags } = useTags();

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const toggleComplete = useToggleTaskComplete();
  const deleteTask = useDeleteTask();
  const snoozeTask = useSnoozeTask();

  const selectedTask =
    tasks.find((t) => t.id === selectedTaskId) ??
    buckets.allCompleted.find((t) => t.id === selectedTaskId) ??
    null;

  const handleSelectTask = useCallback((task: TaskWithTags) => {
    setIsInspectorClosing(false);
    setIsDraft(false);
    setSelectedTaskId(task.id);
  }, []);

  const handleNewTaskClick = useCallback(() => {
    setIsInspectorClosing(false);
    setSelectedTaskId(null);
    setIsDraft(true);
  }, []);

  useEffect(() => {
    const isNew = searchParams.get('new') === 'true' || searchParams.get('newTask') === 'true';
    if (isNew) {
      setIsInspectorClosing(false);
      setSelectedTaskId(null);
      setIsDraft(true);
    }
  }, [searchParams]);

  const taskParam = searchParams.get('task');
  useEffect(() => {
    if (taskParam) {
      setIsInspectorClosing(false);
      setIsDraft(false);
      setSelectedTaskId(taskParam);
    }
  }, [taskParam]);

  const isInspectorOpen = Boolean(selectedTask || isDraft);

  const handleCloseInspector = useCallback(() => {
    if (!selectedTask && !isDraft) {
      if (selectedTaskId) {
        setSelectedTaskId(null);
      }
      return;
    }
    if (isInspectorClosing) return;
    setIsInspectorClosing(true);
  }, [selectedTask, isDraft, selectedTaskId, isInspectorClosing]);

  const handleInspectorCloseAnimationEnd = useCallback(() => {
    setSelectedTaskId(null);
    setIsDraft(false);
    setIsInspectorClosing(false);

    if (searchParams.has('newTask') || searchParams.has('new') || searchParams.has('task')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('newTask');
          next.delete('new');
          next.delete('task');
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams]);

  const handleToggleComplete = useCallback(
    (task: TaskWithTags, completed: boolean) => {
      toggleComplete.mutate({ id: task.id, completed });
    },
    [toggleComplete],
  );

  const handleSnooze = useCallback(
    (task: TaskWithTags) => {
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

      snoozeTask.mutate({ id: task.id, dueAt, hasDueTime: task.hasDueTime });
    },
    [snoozeTask, timeZone],
  );

  const handleDelete = useCallback(
    (task: TaskWithTags) => {
      if (selectedTaskId === task.id) {
        handleCloseInspector();
      }
      deleteTask.mutate(task.id);
    },
    [deleteTask, handleCloseInspector, selectedTaskId],
  );

  const handleQuickAdd = useCallback(
    async (title: string) => {
      await createTask.mutateAsync({
        title,
        listId: selectedListId,
        priority: 'normal',
        hasDueTime: false,
        isFlexible: true,
        tagIds: [],
      });
    },
    [createTask, selectedListId],
  );

  const handleInspectorSave = useCallback(
    async (data: CreateTaskInput | UpdateTaskInput) => {
      if ('id' in data) {
        await updateTask.mutateAsync(data);
      } else {
        const created = await createTask.mutateAsync(data);
        setIsDraft(false);
        setSelectedTaskId(created.id);
      }
    },
    [createTask, updateTask],
  );

  return (
    <div className={styles.container}>
      <TaskListPane
        buckets={buckets}
        allTasks={tasks}
        lists={lists}
        selectedTaskId={selectedTaskId}
        selectedListId={selectedListId}
        activeTab={activeTab}
        isLoading={isLoading}
        isError={isError}
        now={now}
        timeZone={timeZone}
        onTabChange={setActiveTab}
        onListChange={setSelectedListId}
        onSelectTask={handleSelectTask}
        onToggleComplete={handleToggleComplete}
        onSnooze={handleSnooze}
        onDelete={handleDelete}
        onQuickAdd={handleQuickAdd}
        onNewTaskClick={handleNewTaskClick}
        onRetry={refetch}
        onEmptySpaceClick={isInspectorOpen ? handleCloseInspector : undefined}
      />

      {(selectedTask || isDraft || isInspectorClosing) && (
        <>
          <button
            type="button"
            className={`${styles.inspectorBackdrop} ${
              isInspectorClosing ? styles.inspectorBackdropClosing : ''
            }`}
            aria-label="Close task inspector"
            onClick={handleCloseInspector}
          />
          <TaskInspector
            task={selectedTask}
            isDraft={isDraft}
            isClosing={isInspectorClosing}
            lists={lists}
            tags={tags}
            timeZone={timeZone}
            isSaving={createTask.isPending || updateTask.isPending}
            onClose={handleCloseInspector}
            onCloseAnimationEnd={handleInspectorCloseAnimationEnd}
            onSave={handleInspectorSave}
            onToggleComplete={handleToggleComplete}
            onSnooze={handleSnooze}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  );
}
