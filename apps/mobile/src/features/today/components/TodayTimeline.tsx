import { formatDuration, formatTimeOfDay } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { TodayEventOccurrence } from '../hooks/useTodaySummary';

export interface TodayTimelineProps {
  /** Timed occurrences only. All-day events are shown above the timeline. */
  items: readonly TodayEventOccurrence[];
  allDay: readonly TodayEventOccurrence[];
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onOpenEvent: (eventId: string) => void;
  onAddEvent: () => void;
}

/**
 * The web's Schedule timeline: a right-aligned time column, a spine with a
 * node per entry, and the event itself in a bordered card led by its
 * calendar's colour.
 */
export function TodayTimeline({
  items,
  allDay,
  timeZone,
  hourCycle,
  now,
  onOpenEvent,
  onAddEvent,
}: TodayTimelineProps) {
  const theme = useTheme();

  return (
    <View>
      {allDay.length > 0 ? (
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.lg,
            borderBottomWidth: theme.borderWidth.hairline,
            borderBottomColor: theme.colors.borderSubtle,
          }}
        >
          <Text variant="caption" color="tertiary" uppercase>
            All-day
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {allDay.map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.event.title}
                onPress={() => onOpenEvent(item.event.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 4,
                  paddingHorizontal: theme.spacing.sm,
                  borderRadius: theme.radius.sm,
                  borderWidth: theme.borderWidth.hairline,
                  borderColor: theme.colors.borderSubtle,
                  backgroundColor: pressed
                    ? theme.colors.surfaceElevated
                    : theme.colors.surfaceRaised,
                })}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 2,
                    backgroundColor: item.calendar?.color ?? theme.colors.accent,
                  }}
                />
                <Text variant="footnote" numberOfLines={1}>
                  {item.event.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {items.length === 0 ? (
        <EmptySchedule onAddEvent={onAddEvent} />
      ) : (
        <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
          {items.map((item, index) => (
            <TimelineEntry
              key={item.key}
              item={item}
              isLast={index === items.length - 1}
              timeZone={timeZone}
              hourCycle={hourCycle}
              now={now}
              onPress={() => onOpenEvent(item.event.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

interface TimelineEntryProps {
  item: TodayEventOccurrence;
  isLast: boolean;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onPress: () => void;
}

function TimelineEntry({ item, isLast, timeZone, hourCycle, now, onPress }: TimelineEntryProps) {
  const theme = useTheme();

  const nowMs = now.getTime();
  const isCurrent = nowMs >= item.start && nowMs < item.end;
  const isPast = nowMs >= item.end;
  const tint = item.calendar?.color ?? theme.colors.accent;

  const startLabel = formatTimeOfDay(new Date(item.start), timeZone, hourCycle);
  const endLabel = formatTimeOfDay(new Date(item.end), timeZone, hourCycle);
  const durationLabel = formatDuration(Math.round((item.end - item.start) / 60000));

  return (
    <View style={{ flexDirection: 'row', minHeight: 64, opacity: isPast ? 0.55 : 1 }}>
      <View style={{ width: 64, paddingTop: 4, paddingRight: theme.spacing.sm }}>
        <Text variant="mono" color="secondary" style={{ fontSize: 12, textAlign: 'right' }}>
          {startLabel}
        </Text>
        <Text
          variant="footnote"
          color="tertiary"
          style={{ fontSize: 11, textAlign: 'right', marginTop: 1 }}
        >
          {durationLabel}
        </Text>
      </View>

      <View style={{ width: 20, alignItems: 'center' }}>
        {/* The spine runs behind the node and stops at the last entry. */}
        {!isLast ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: theme.borderWidth.hairline,
              backgroundColor: theme.colors.borderSubtle,
            }}
          />
        ) : null}
        <View
          style={{
            marginTop: 7,
            width: 8,
            height: 8,
            borderRadius: 2,
            borderWidth: 1.5,
            borderColor: tint,
            backgroundColor: isCurrent ? tint : theme.colors.surface,
          }}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.event.title}, ${startLabel} to ${endLabel}`}
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: 'row',
          marginBottom: theme.spacing.sm,
          borderRadius: theme.radius.sm,
          borderWidth: theme.borderWidth.hairline,
          borderColor: isCurrent ? tint : theme.colors.borderSubtle,
          backgroundColor: pressed ? theme.colors.surfaceElevated : theme.colors.surfaceRaised,
          overflow: 'hidden',
        })}
      >
        <View style={{ width: 3, backgroundColor: tint }} />
        <View
          style={{
            flex: 1,
            gap: 2,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="subhead" numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
              {item.event.title}
            </Text>
            {isCurrent ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 1,
                  paddingHorizontal: 5,
                  borderRadius: 3,
                  backgroundColor: theme.colors.successSubtle,
                }}
              >
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 1,
                    backgroundColor: theme.colors.success,
                  }}
                />
                <Text variant="caption" style={{ color: theme.colors.success }}>
                  Live
                </Text>
              </View>
            ) : null}
          </View>

          <Text variant="footnote" color="tertiary" numberOfLines={1} style={{ fontSize: 11 }}>
            {startLabel} – {endLabel} · {item.calendar?.name ?? 'Calendar'}
            {item.event.location ? ` · ${item.event.location}` : ''}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function EmptySchedule({ onAddEvent }: { onAddEvent: () => void }) {
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
      <Ionicons name="calendar-outline" size={28} color={theme.colors.textTertiary} />
      <Text variant="subhead" style={{ marginTop: theme.spacing.sm, fontWeight: '600' }}>
        Your schedule is clear
      </Text>
      <Text
        variant="footnote"
        color="tertiary"
        align="center"
        style={{ maxWidth: 260, marginBottom: theme.spacing.md }}
      >
        No timed commitments today. Enjoy uninterrupted focus time.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Schedule Event"
        onPress={onAddEvent}
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
          + Schedule Event
        </Text>
      </Pressable>
    </View>
  );
}
