import {
  PRIORITY_LABELS,
  describeRRule,
  describeTaskDue,
  formatDuration,
  isNotablePriority,
  parseRRule,
} from '@cal/domain';
import type { HourCycle, Task } from '@cal/schemas';
import { Checkbox, Text, strikeThroughStyle, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { SwipeAction } from './SwipeAction';

export interface TaskListRowProps {
  task: Task;
  listName?: string;
  listColor?: string;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  /** Ticked, waiting out the undo window: struck through, with Undo in place of details. */
  completing: boolean;
  onToggleComplete: (completed: boolean) => void;
  onUndo: () => void;
  onPress: () => void;
  onSnooze: () => void;
  onDelete: () => void;
}

/**
 * One line on the Tasks screen — the flat, calm row from the Tasks redesign.
 *
 * Details are one quiet line of text rather than badges; colour is spent only
 * where it means something: the checkbox ring (red when late, amber when high
 * priority) and a list's dot. Swipe right completes; swipe left reveals move
 * to tomorrow and delete.
 */
export function TaskListRow({
  task,
  listName,
  listColor,
  timeZone,
  hourCycle,
  now,
  completing,
  onToggleComplete,
  onUndo,
  onPress,
  onSnooze,
  onDelete,
}: TaskListRowProps) {
  const theme = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const completed = task.status === 'completed';
  const done = completed || completing;
  const due = describeTaskDue(task, { now, timeZone, hourCycle });

  const priorityColor = isNotablePriority(task.priority)
    ? task.priority === 'urgent'
      ? theme.colors.danger
      : theme.colors.warning
    : undefined;
  // Lateness outranks priority on the ring; the flag keeps showing priority.
  const ringColor = due.tone === 'overdue' ? theme.colors.danger : priorityColor;

  const showPriority = isNotablePriority(task.priority) && !done;
  const showDue = due.tone !== 'none' && !done;
  const repeat = showDue && task.recurrenceRule ? parseRRule(task.recurrenceRule) : null;
  const showDuration = !done && task.estimatedMinutes !== null && task.estimatedMinutes > 0;
  const hasDetails = showPriority || showDue || showDuration || (Boolean(listName) && !done);

  const close = (then: () => void) => {
    swipeableRef.current?.close();
    then();
  };

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      leftThreshold={72}
      rightThreshold={40}
      enabled={!completing}
      renderLeftActions={() => (
        <SwipeAction
          icon={completed ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
          label={completed ? 'Reopen' : 'Done'}
          background={theme.colors.successSubtle}
          tint={theme.colors.success}
          onPress={() => close(() => onToggleComplete(!completed))}
        />
      )}
      renderRightActions={() => (
        <View style={{ flexDirection: 'row' }}>
          {completed ? null : (
            <SwipeAction
              icon="calendar-outline"
              label="Tomorrow"
              background={theme.colors.warningSubtle}
              tint={theme.colors.warning}
              onPress={() => close(onSnooze)}
            />
          )}
          <SwipeAction
            icon="trash-outline"
            label="Delete"
            background={theme.colors.dangerSubtle}
            tint={theme.colors.danger}
            onPress={() => close(onDelete)}
          />
        </View>
      )}
      onSwipeableOpen={(direction) => {
        // Left actions open with a rightward swipe.
        if (direction !== 'right') return;
        close(() => onToggleComplete(!completed));
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={task.title}
        accessibilityHint="Opens the task editor"
        onPress={completing ? onUndo : onPress}
        style={({ pressed }) => [
          styles.row,
          {
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            minHeight: theme.hitSlopSize + theme.spacing.sm,
            borderBottomWidth: theme.borderWidth.hairline,
            borderBottomColor: theme.colors.borderSubtle,
            backgroundColor: pressed ? theme.colors.hover : theme.colors.background,
          },
        ]}
      >
        <Checkbox
          round
          checked={done}
          ringColor={ringColor}
          onChange={(checked) => (completing ? onUndo() : onToggleComplete(checked))}
          size={20}
          style={{ marginTop: 1 }}
          accessibilityLabel={done ? `Mark ${task.title} not done` : `Complete ${task.title}`}
          testID={`task-checkbox-${task.id}`}
        />

        <View style={styles.body}>
          <Text
            variant="callout"
            numberOfLines={2}
            color={done ? 'tertiary' : 'primary'}
            style={done ? strikeThroughStyle : undefined}
          >
            {task.title}
          </Text>

          {completing ? (
            <Text variant="footnote" style={{ color: theme.colors.accent }}>
              Undo
            </Text>
          ) : hasDetails ? (
            <View style={[styles.details, { gap: theme.spacing.sm }]}>
              {showDue ? (
                <Detail
                  label={due.text}
                  color={due.tone === 'overdue' ? theme.colors.danger : undefined}
                />
              ) : null}
              {showPriority ? (
                <View style={styles.inline}>
                  <Ionicons name="flag" size={11} color={priorityColor} />
                  <Detail label={PRIORITY_LABELS[task.priority]} />
                </View>
              ) : null}
              {showDuration ? <Detail label={formatDuration(task.estimatedMinutes ?? 0)} /> : null}
              {repeat ? (
                <Ionicons
                  name="repeat"
                  size={12}
                  color={theme.colors.textTertiary}
                  accessibilityLabel={`Repeats: ${describeRRule(repeat)}`}
                />
              ) : null}
              {listName && !done ? (
                <View style={[styles.inline, { gap: 4 }]}>
                  {listColor ? <View style={[styles.dot, { backgroundColor: listColor }]} /> : null}
                  <Detail label={listName} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function Detail({ label, color }: { label: string; color?: string }) {
  return (
    <Text
      variant="footnote"
      color="tertiary"
      numberOfLines={1}
      style={color ? { color } : undefined}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  body: { flex: 1, gap: 2 },
  details: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
