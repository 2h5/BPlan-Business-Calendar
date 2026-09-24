import { formatDuration, formatTimeOfDay, resolveEventColor } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { TodayEventOccurrence, TodayTimelineItem } from '../hooks/useTodaySummary';

export interface TodayScheduleProps {
  allDay: readonly TodayEventOccurrence[];
  /** Timed events and timed tasks, in start order. */
  items: readonly TodayTimelineItem[];
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onOpenEvent: (eventId: string) => void;
  onOpenTask: (taskId: string) => void;
  onOpenCalendar: () => void;
  onPlan: () => void;
}

/**
 * Today's commitments as a plain list: all-day first, then timed items with
 * their start on the right. Past items fade; the one happening now is tinted.
 */
export function TodaySchedule({
  allDay,
  items,
  timeZone,
  hourCycle,
  now,
  onOpenEvent,
  onOpenTask,
  onOpenCalendar,
  onPlan,
}: TodayScheduleProps) {
  const theme = useTheme();
  const nowMs = now.getTime();
  const isEmpty = allDay.length === 0 && items.length === 0;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text variant="title3" accessibilityRole="header" style={{ flex: 1 }}>
          Schedule
        </Text>
        <Pressable accessibilityRole="link" onPress={onOpenCalendar} hitSlop={theme.spacing.sm}>
          <Text variant="footnote" color="accent">
            Full calendar
          </Text>
        </Pressable>
      </View>

      {isEmpty ? (
        <View style={{ paddingVertical: theme.spacing.lg, gap: theme.spacing.sm }}>
          <Text variant="callout" color="secondary">
            Nothing scheduled today.
          </Text>
          <Pressable accessibilityRole="button" onPress={onPlan} hitSlop={theme.spacing.sm}>
            <Text variant="footnote" color="accent">
              Plan something
            </Text>
          </Pressable>
        </View>
      ) : null}

      {allDay.map((item, index) => (
        <ScheduleRow
          key={item.key}
          first={index === 0}
          color={resolveEventColor(item.event.color, item.calendar?.color, theme.colors.accent)}
          title={item.event.title}
          detail={item.event.location ?? item.calendar?.name ?? null}
          time="All day"
          onPress={() => onOpenEvent(item.event.id)}
        />
      ))}

      {items.map((item, index) => {
        const past = item.end <= nowMs;
        const live = item.start <= nowMs && nowMs < item.end;
        const duration = formatDuration(Math.round((item.end - item.start) / 60_000));
        const time = formatTimeOfDay(new Date(item.start), timeZone, hourCycle);
        const first = allDay.length === 0 && index === 0;

        if (item.kind === 'task') {
          return (
            <ScheduleRow
              key={item.key}
              first={first}
              task
              color={theme.colors.accent}
              title={item.task.title}
              detail={`Task · ${duration}`}
              time={time}
              past={past}
              live={live}
              onPress={() => onOpenTask(item.task.id)}
            />
          );
        }

        const { event, calendar } = item.occurrence;
        return (
          <ScheduleRow
            key={item.key}
            first={first}
            color={resolveEventColor(event.color, calendar?.color, theme.colors.accent)}
            title={event.title}
            detail={[duration, event.location ?? calendar?.name].filter(Boolean).join(' · ')}
            time={time}
            past={past}
            live={live}
            onPress={() => onOpenEvent(event.id)}
          />
        );
      })}
    </View>
  );
}

interface ScheduleRowProps {
  first: boolean;
  color: string;
  title: string;
  detail: string | null;
  time: string;
  task?: boolean;
  past?: boolean;
  live?: boolean;
  onPress: () => void;
}

function ScheduleRow({
  first,
  color,
  title,
  detail,
  time,
  task,
  past,
  live,
  onPress,
}: ScheduleRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, time, detail, live ? 'happening now' : null]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: 52,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: live ? theme.spacing.sm : 0,
        marginHorizontal: live ? -theme.spacing.sm : 0,
        borderRadius: live ? theme.radius.md : 0,
        borderTopWidth: first || live ? 0 : theme.borderWidth.hairline,
        borderTopColor: theme.colors.borderSubtle,
        backgroundColor: live
          ? theme.colors.successSubtle
          : pressed
            ? theme.colors.hover
            : 'transparent',
        opacity: past ? 0.5 : 1,
      })}
    >
      {task ? (
        <Ionicons name="ellipse-outline" size={14} color={color} style={{ width: 14 }} />
      ) : (
        <View style={{ width: 3, height: 30, borderRadius: 2, backgroundColor: color }} />
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="callout" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text variant="footnote" color="tertiary" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Text
        variant="footnote"
        color={live ? 'success' : 'secondary'}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {live ? 'Now' : time}
      </Text>
    </Pressable>
  );
}
