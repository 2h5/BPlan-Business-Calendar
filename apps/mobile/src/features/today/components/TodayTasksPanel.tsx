import type { HourCycle, Task, TaskList } from '@cal/schemas';
import { Divider, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';

import { TaskRow } from '../../tasks/components/TaskRow';

export interface TodayTasksPanelProps {
  overdue: readonly Task[];
  dueToday: readonly Task[];
  unscheduled: readonly Task[];
  completedToday: readonly Task[];
  lists: readonly TaskList[];
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onQuickAdd: () => void;
  onOpenTask: (task: Task) => void;
  onToggleComplete: (task: Task, completed: boolean) => void;
  onSnooze: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMoveToToday: (tasks: readonly Task[]) => void;
}

/**
 * Today's work as one group: overdue first, then due today, then flexible
 * tasks with an estimate. Each row already says why it is here ("3 days
 * overdue", "Today"), so the group needs no sub-headings; overdue work gets a
 * one-tap way back onto today instead.
 */
export function TodayTasksPanel({
  overdue,
  dueToday,
  unscheduled,
  completedToday,
  lists,
  timeZone,
  hourCycle,
  now,
  onQuickAdd,
  onOpenTask,
  onToggleComplete,
  onSnooze,
  onDelete,
  onMoveToToday,
}: TodayTasksPanelProps) {
  const theme = useTheme();
  const [showCompleted, setShowCompleted] = useState(false);

  const open = [...overdue, ...dueToday, ...unscheduled];
  const listById = new Map(lists.map((list) => [list.id, list]));

  const renderTasks = (tasks: readonly Task[]) =>
    tasks.map((task, index) => {
      const list = task.listId ? listById.get(task.listId) : undefined;

      return (
        <Fragment key={task.id}>
          {index > 0 ? <Divider /> : null}
          <TaskRow
            task={task}
            listName={list?.name}
            listColor={list?.color}
            timeZone={timeZone}
            hourCycle={hourCycle}
            now={now}
            onToggleComplete={(completed) => onToggleComplete(task, completed)}
            onPress={() => onOpenTask(task)}
            onSnooze={() => onSnooze(task)}
            onDelete={() => onDelete(task)}
          />
        </Fragment>
      );
    });

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
        <Text variant="title3" accessibilityRole="header" style={{ flex: 1 }}>
          Tasks
        </Text>
        {overdue.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${overdue.length} overdue. Move to today`}
            onPress={() => onMoveToToday(overdue)}
            hitSlop={theme.spacing.sm}
          >
            <Text variant="footnote" color="danger">
              {`${overdue.length} overdue · `}
              <Text variant="footnote" color="accent">
                Move to today
              </Text>
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          overflow: 'hidden',
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth.hairline,
          borderColor: theme.colors.borderSubtle,
          backgroundColor: theme.colors.surface,
        }}
      >
        {open.length === 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onQuickAdd}
            style={({ pressed }) => ({
              gap: 2,
              padding: theme.spacing.lg,
              backgroundColor: pressed ? theme.colors.hover : 'transparent',
            })}
          >
            <Text variant="callout">Nothing due today</Text>
            <Text variant="footnote" color="accent">
              Add a task
            </Text>
          </Pressable>
        ) : (
          renderTasks(open)
        )}

        {completedToday.length > 0 ? (
          <View
            style={{
              borderTopWidth: theme.borderWidth.hairline,
              borderTopColor: theme.colors.borderSubtle,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showCompleted }}
              accessibilityLabel={`Completed today, ${completedToday.length}`}
              onPress={() => setShowCompleted((visible) => !visible)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.lg,
                backgroundColor: pressed ? theme.colors.hover : 'transparent',
              })}
            >
              <Ionicons
                name={showCompleted ? 'chevron-down' : 'chevron-forward'}
                size={14}
                color={theme.colors.textTertiary}
              />
              <Text variant="footnote" color="secondary" style={{ flex: 1 }}>
                Completed today
              </Text>
              <Text variant="footnote" color="tertiary">
                {completedToday.length}
              </Text>
            </Pressable>

            {showCompleted ? <View>{renderTasks(completedToday)}</View> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
