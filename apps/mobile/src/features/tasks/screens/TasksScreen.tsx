import { Chip, EmptyState, ErrorState, LoadingState, Text, useTheme } from '@cal/ui';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { InlineAddTask } from '../components/InlineAddTask';
import { TaskSection } from '../components/TaskSection';
import { useDeferredCompletion } from '../hooks/useDeferredCompletion';
import { useTaskActions } from '../hooks/useTaskActions';
import { useTaskBuckets } from '../hooks/useTaskBuckets';
import { useTaskLists, useTasks } from '../hooks/useTasks';

/**
 * The task list — tasks and nothing else. The calendar, workload, and
 * suggestions live on Today; this screen is for capturing and clearing work.
 *
 * Capture sits inline at the top, work is grouped by how soon it is due, and
 * the day's completed tasks fold away into one line. Sections hide themselves
 * when empty so a light day stays short.
 */
export function TasksScreen() {
  const theme = useTheme();

  // `undefined` = every list; `null` = the inbox specifically.
  const [listFilter, setListFilter] = useState<string | null | undefined>(undefined);

  const { data: lists } = useTaskLists();
  const { data: allTasks } = useTasks();
  const { buckets, tasks, timeZone, hourCycle, now, isLoading, isError, refetch } = useTaskBuckets(
    listFilter === undefined ? undefined : { listId: listFilter },
  );
  const actions = useTaskActions();
  const completion = useDeferredCompletion((task) => actions.onToggleComplete(task, true));

  if (isLoading) return <LoadingState label="Loading your tasks" />;
  if (isError) {
    return (
      <ErrorState
        title="We could not load your tasks"
        message="Check your connection and try again."
        onRetry={refetch}
      />
    );
  }

  const openCountFor = (listId: string | null | undefined) =>
    (allTasks ?? []).filter(
      (task) => task.status !== 'completed' && (listId === undefined || task.listId === listId),
    ).length;

  const sectionProps = {
    lists: lists ?? [],
    timeZone,
    hourCycle,
    now,
    completingIds: completion.pendingIds,
    // Ticking waits out an in-place undo; reopening a completed task is immediate.
    onToggleComplete: (task: (typeof tasks)[number], completed: boolean) =>
      completed ? completion.complete(task) : actions.onToggleComplete(task, false),
    onUndoComplete: (task: (typeof tasks)[number]) => completion.undo(task.id),
    onOpenTask: actions.onOpenTask,
    onSnooze: actions.onSnooze,
    onDelete: actions.onDelete,
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Text variant="title1">Tasks</Text>

      {(lists ?? []).length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.lg }}
        >
          <Chip
            label={`All ${openCountFor(undefined)}`}
            selected={listFilter === undefined}
            onPress={() => setListFilter(undefined)}
          />
          <Chip
            label={`Inbox ${openCountFor(null)}`}
            icon="file-tray-outline"
            selected={listFilter === null}
            onPress={() => setListFilter(null)}
          />
          {(lists ?? []).map((list) => (
            <Chip
              key={list.id}
              label={`${list.name} ${openCountFor(list.id)}`}
              color={list.color}
              selected={listFilter === list.id}
              onPress={() => setListFilter(list.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: theme.spacing.xl }}>
        {/* Captures into whichever list is filtered, so adding a task from a
            list does not silently drop it in the inbox. Keyed on the filter so
            switching lists resets a half-typed draft's list. */}
        <InlineAddTask
          key={String(listFilter)}
          lists={lists ?? []}
          defaultListId={listFilter ?? null}
        />

        {tasks.length === 0 ? (
          <EmptyState
            icon="file-tray-outline"
            title="Nothing to do here"
            message="Add a task above and it lands in this list."
          />
        ) : (
          <>
            <TaskSection title="Overdue" tone="danger" tasks={buckets.overdue} {...sectionProps} />
            <TaskSection title="Today" tasks={buckets.dueToday} {...sectionProps} />
            <TaskSection title="Upcoming" tasks={buckets.upcoming} {...sectionProps} />
            <TaskSection title="Scheduled" tasks={buckets.scheduled} {...sectionProps} />
            <TaskSection title="No date" tasks={buckets.someday} {...sectionProps} />
            <TaskSection
              title="Completed"
              collapsible
              tasks={buckets.completedToday}
              {...sectionProps}
            />
          </>
        )}
      </View>
    </View>
  );
}
