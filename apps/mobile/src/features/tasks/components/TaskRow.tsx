import { PRIORITY_LABELS, describeTaskDue, formatDuration, isNotablePriority } from '@cal/domain';
import type { HourCycle, Task, TaskPriority } from '@cal/schemas';
import { Checkbox, Text, strikeThroughStyle, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

export interface TaskRowProps {
  task: Task;
  /** Name of the list the task belongs to, if any. */
  listName?: string;
  listColor?: string;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onToggleComplete: (completed: boolean) => void;
  onPress: () => void;
  onSnooze?: () => void;
  onDelete?: () => void;
}

/**
 * One line in the inbox or on Today.
 *
 * The badge row mirrors the web client's task row — list, priority, due, and
 * estimate as small rectangular tags — so a task reads the same on both
 * surfaces. Where the web reveals snooze and delete on hover, which a touch
 * screen has no equivalent for, the row exposes them on swipe instead.
 */
export function TaskRow({
  task,
  listName,
  listColor,
  timeZone,
  hourCycle,
  now,
  onToggleComplete,
  onPress,
  onSnooze,
  onDelete,
}: TaskRowProps) {
  const theme = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const completed = task.status === 'completed';
  const due = describeTaskDue(task, { now, timeZone, hourCycle });

  const priorityTone: Record<TaskPriority, { fg: string; bg: string }> = {
    urgent: { fg: theme.colors.danger, bg: theme.colors.dangerSubtle },
    high: { fg: theme.colors.warning, bg: theme.colors.warningSubtle },
    normal: { fg: theme.colors.textTertiary, bg: theme.colors.surfaceElevated },
    low: { fg: theme.colors.textTertiary, bg: theme.colors.surfaceElevated },
  };

  const dueTone =
    due.tone === 'overdue'
      ? { fg: theme.colors.danger, bg: theme.colors.dangerSubtle }
      : due.tone === 'today'
        ? { fg: theme.colors.accent, bg: theme.colors.accentSubtle }
        : { fg: theme.colors.textSecondary, bg: theme.colors.surfaceElevated };

  const renderRightActions = () => (
    <View style={{ flexDirection: 'row' }}>
      {onSnooze ? (
        <SwipeAction
          icon="time-outline"
          label="Snooze"
          background={theme.colors.warningSubtle}
          tint={theme.colors.warning}
          onPress={() => {
            swipeableRef.current?.close();
            onSnooze();
          }}
        />
      ) : null}
      {onDelete ? (
        <SwipeAction
          icon="trash-outline"
          label="Delete"
          background={theme.colors.dangerSubtle}
          tint={theme.colors.danger}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
        />
      ) : null}
    </View>
  );

  const showPriority = isNotablePriority(task.priority) && !completed;
  const showDue = due.tone !== 'none' && !completed;
  const showDuration = task.estimatedMinutes !== null && task.estimatedMinutes > 0;
  const hasBadges = Boolean(listName) || showPriority || showDue || showDuration;

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      enabled={!!onSnooze || !!onDelete}
      renderRightActions={onSnooze || onDelete ? renderRightActions : undefined}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={task.title}
        accessibilityHint="Opens the task editor"
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            minHeight: theme.hitSlopSize + theme.spacing.sm,
            opacity: completed ? 0.6 : 1,
            backgroundColor: pressed ? theme.colors.hover : theme.colors.surface,
          },
        ]}
      >
        <Checkbox
          checked={completed}
          onChange={onToggleComplete}
          size={18}
          accessibilityLabel={completed ? `Mark ${task.title} not done` : `Complete ${task.title}`}
          testID={`task-checkbox-${task.id}`}
        />

        <View style={styles.body}>
          <Text
            variant="subhead"
            numberOfLines={2}
            color={completed ? 'tertiary' : 'primary'}
            style={completed ? strikeThroughStyle : undefined}
          >
            {task.title}
          </Text>

          {hasBadges ? (
            <View style={[styles.badges, { gap: theme.spacing.sm }]}>
              {listName ? (
                <View style={[styles.listPill, { gap: 4 }]}>
                  {listColor ? (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 2,
                        backgroundColor: listColor,
                      }}
                    />
                  ) : null}
                  <Text variant="footnote" color="tertiary" style={styles.badgeText}>
                    {listName}
                  </Text>
                </View>
              ) : null}

              {showPriority ? (
                <Badge
                  label={PRIORITY_LABELS[task.priority]}
                  fg={priorityTone[task.priority].fg}
                  bg={priorityTone[task.priority].bg}
                />
              ) : null}

              {showDue ? <Badge label={due.text} fg={dueTone.fg} bg={dueTone.bg} /> : null}

              {showDuration ? (
                <View style={[styles.listPill, { gap: 3 }]}>
                  <Ionicons name="time-outline" size={11} color={theme.colors.textTertiary} />
                  <Text variant="footnote" color="tertiary" style={styles.badgeText}>
                    {formatDuration(task.estimatedMinutes ?? 0)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {task.scheduledEventId ? (
          <Ionicons name="calendar" size={14} color={theme.colors.textTertiary} />
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

/** The web's crisp rectangular tag — a 3px radius, not a pill. */
function Badge({ label, fg, bg }: { label: string; fg: string; bg: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="footnote" style={[styles.badgeText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SwipeAction({
  icon,
  label,
  background,
  tint,
  onPress,
}: {
  icon: 'time-outline' | 'trash-outline';
  label: string;
  background: string;
  tint: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 76,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xxs,
        backgroundColor: background,
      }}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text variant="caption" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, gap: 3 },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  listPill: { flexDirection: 'row', alignItems: 'center' },
  badge: { paddingVertical: 1, paddingHorizontal: 5, borderRadius: 3 },
  badgeText: { fontSize: 11, lineHeight: 16 },
});
