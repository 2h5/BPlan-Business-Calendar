import type { HourCycle, Task, TaskList } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { TaskListRow } from './TaskListRow';

export interface TaskSectionProps {
  title: string;
  tasks: readonly Task[];
  lists: readonly TaskList[];
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  /** Tints the header, e.g. red for overdue. */
  tone?: 'default' | 'danger';
  /** Starts folded to a single "N completed" line. */
  collapsible?: boolean;
  completingIds: ReadonlySet<string>;
  onToggleComplete: (task: Task, completed: boolean) => void;
  onUndoComplete: (task: Task) => void;
  onOpenTask: (task: Task) => void;
  onSnooze: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/** A headed run of task rows on the Tasks screen. Renders nothing when empty. */
export function TaskSection({
  title,
  tasks,
  lists,
  timeZone,
  hourCycle,
  now,
  tone = 'default',
  collapsible = false,
  completingIds,
  onToggleComplete,
  onUndoComplete,
  onOpenTask,
  onSnooze,
  onDelete,
}: TaskSectionProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(!collapsible);

  if (tasks.length === 0) return null;

  const listById = new Map(lists.map((list) => [list.id, list]));
  const headerColor = tone === 'danger' ? theme.colors.danger : theme.colors.textSecondary;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.xs }}>
      <Text variant="subhead" style={{ flex: 1, color: headerColor }}>
        {collapsible ? `${tasks.length} ${title.toLowerCase()}` : title}
      </Text>
      {collapsible ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}>
          <Text variant="footnote" color="tertiary">
            {expanded ? 'Hide' : 'Show'}
          </Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.colors.textTertiary}
          />
        </View>
      ) : (
        <Text variant="footnote" color="tertiary">
          {tasks.length}
        </Text>
      )}
    </View>
  );

  return (
    <View>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${tasks.length} ${title.toLowerCase()}`}
          onPress={() => setExpanded((current) => !current)}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}

      {expanded
        ? tasks.map((task) => {
            const list = task.listId ? listById.get(task.listId) : undefined;
            return (
              <TaskListRow
                key={task.id}
                task={task}
                listName={list?.name}
                listColor={list?.color}
                timeZone={timeZone}
                hourCycle={hourCycle}
                now={now}
                completing={completingIds.has(task.id)}
                onToggleComplete={(completed) => onToggleComplete(task, completed)}
                onUndo={() => onUndoComplete(task)}
                onPress={() => onOpenTask(task)}
                onSnooze={() => onSnooze(task)}
                onDelete={() => onDelete(task)}
              />
            );
          })
        : null}
    </View>
  );
}
