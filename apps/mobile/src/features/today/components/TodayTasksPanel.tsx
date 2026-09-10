import type { HourCycle, Task, TaskList } from '@cal/schemas';
import { Divider, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Fragment, useState } from 'react';
import { Pressable, View } from 'react-native';

import { PanelSectionHeader, TodayPanel } from './TodayPanel';
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
}

/**
 * The web's "Today's Tasks" panel: overdue, due today, and flexible work as
 * labelled sections inside one container, with today's completed tasks folded
 * away underneath.
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
}: TodayTasksPanelProps) {
  const theme = useTheme();
  const [showCompleted, setShowCompleted] = useState(false);

  const relevantCount = overdue.length + dueToday.length + unscheduled.length;
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
    <TodayPanel
      title="Today's Tasks"
      count={relevantCount}
      actionLabel="+ Quick Add"
      onAction={onQuickAdd}
    >
      {relevantCount === 0 ? (
        <EmptyTasks onQuickAdd={onQuickAdd} />
      ) : (
        <View>
          {overdue.length > 0 ? (
            <>
              <PanelSectionHeader
                label="Overdue"
                count={overdue.length}
                tone="danger"
                icon={<Ionicons name="warning" size={12} color={theme.colors.danger} />}
              />
              {renderTasks(overdue)}
            </>
          ) : null}

          {dueToday.length > 0 ? (
            <>
              <PanelSectionHeader label="Due Today" count={dueToday.length} />
              {renderTasks(dueToday)}
            </>
          ) : null}

          {unscheduled.length > 0 ? (
            <>
              <PanelSectionHeader label="Flexible Focus" count={unscheduled.length} />
              {renderTasks(unscheduled)}
            </>
          ) : null}
        </View>
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
            onPress={() => setShowCompleted((open) => !open)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              backgroundColor: pressed ? theme.colors.hover : 'transparent',
            })}
          >
            <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} />
            <Text variant="footnote" color="secondary" style={{ flex: 1 }}>
              Completed today
            </Text>
            <Text variant="footnote" color="tertiary">
              {completedToday.length}
            </Text>
            <Ionicons
              name={showCompleted ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={theme.colors.textTertiary}
            />
          </Pressable>

          {showCompleted ? <View>{renderTasks(completedToday)}</View> : null}
        </View>
      ) : null}
    </TodayPanel>
  );
}

function EmptyTasks({ onQuickAdd }: { onQuickAdd: () => void }) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.xxxl,
        paddingHorizontal: theme.spacing.lg,
      }}
    >
      <Ionicons name="checkmark-done-outline" size={28} color={theme.colors.textTertiary} />
      <Text variant="subhead" style={{ marginTop: theme.spacing.sm, fontWeight: '600' }}>
        No tasks for today
      </Text>
      <Text
        variant="footnote"
        color="tertiary"
        align="center"
        style={{ maxWidth: 260, marginBottom: theme.spacing.md }}
      >
        You have no overdue items or tasks due today.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a Task"
        onPress={onQuickAdd}
        style={({ pressed }) => ({
          height: theme.controlHeightSm,
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.sm,
          borderWidth: theme.borderWidth.hairline,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceElevated : theme.colors.surfaceRaised,
        })}
      >
        <Text variant="footnote" style={{ fontWeight: '500' }}>
          + Add a Task
        </Text>
      </Pressable>
    </View>
  );
}
