import { formatDuration, resolveEventColor } from '@cal/domain';
import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import type { OccurrenceTiming } from '../../utils/agenda';
import { withAlpha } from '../../utils/color';

export interface AgendaEventRowProps {
  occurrence: EventOccurrence;
  timing: OccurrenceTiming;
  /** Already over — drawn faded so what is left of the day stands out. */
  past: boolean;
  /** Under way right now. */
  live: boolean;
  /** Shares time with another event that day. */
  conflict: boolean;
  onPress: () => void;
}

/**
 * One event in the agenda. Timed events show their range and length; an
 * all-day event is a tinted band, so the day's fixed points read apart from
 * what fills the whole of it.
 */
export function AgendaEventRow({
  occurrence,
  timing,
  past,
  live,
  conflict,
  onPress,
}: AgendaEventRowProps) {
  const theme = useTheme();
  const { event } = occurrence;
  const color = resolveEventColor(event.color, occurrence.calendar?.color, theme.colors.accent);
  const cancelled = event.status === 'cancelled';
  const detail = [timing.label, event.location].filter(Boolean).join(' · ');

  const accessibilityLabel = [
    event.title,
    detail,
    cancelled ? 'cancelled' : null,
    live ? 'happening now' : null,
    conflict ? 'overlaps another event' : null,
  ]
    .filter(Boolean)
    .join(', ');

  const title = (
    <Text
      variant="body"
      numberOfLines={2}
      style={{ textDecorationLine: cancelled ? 'line-through' : 'none' }}
    >
      {event.title}
    </Text>
  );

  if (timing.fillsDay) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius: theme.radius.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          backgroundColor: pressed ? theme.colors.surfacePressed : withAlpha(color, 0.16),
          opacity: past || cancelled ? 0.5 : 1,
        })}
      >
        {title}
        <Text variant="caption" color="tertiary" numberOfLines={1}>
          {event.location ? `All day · ${event.location}` : 'All day'}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.radius.sm,
        backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent',
        opacity: past || cancelled ? 0.45 : 1,
      })}
    >
      <View
        style={{
          width: 3,
          alignSelf: 'stretch',
          borderRadius: theme.radius.pill,
          backgroundColor: color,
        }}
      />

      <View style={{ flex: 1 }}>
        {title}
        <Text variant="footnote" color="secondary" numberOfLines={1}>
          {detail}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        {conflict ? (
          <Ionicons name="warning-outline" size={15} color={theme.colors.warning} />
        ) : null}
        {live ? (
          <Text variant="caption" color="accent">
            Now
          </Text>
        ) : timing.minutes !== null ? (
          <Text variant="caption" color="tertiary">
            {formatDuration(timing.minutes)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
