import { formatTimeOfDay, resolveEventColor } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Pressable, View } from 'react-native';

import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { withAlpha } from '../utils/color';

export interface EventChipProps {
  occurrence: EventOccurrence;
  timeZone: string;
  hourCycle: HourCycle;
  onPress: () => void;
  /** Absolute placement inside a timeline column. */
  layout?: { top: number; height: number; left: string; width: string };
  compact?: boolean;
  /**
   * A week column is ~45pt wide, so the chip trims its chrome and lets the
   * title wrap across the block's height instead of ellipsising after a letter.
   */
  narrow?: boolean;
}

const NARROW_TITLE = { fontSize: 11, lineHeight: 13, letterSpacing: 0 } as const;

/**
 * One event as drawn in a timeline. The calendar's colour is carried as a
 * leading bar plus a tinted surface rather than a solid fill, so several
 * overlapping events stay readable instead of becoming blocks of colour.
 */
export function EventChip({
  occurrence,
  timeZone,
  hourCycle,
  onPress,
  layout,
  compact = false,
  narrow = false,
}: EventChipProps) {
  const theme = useTheme();
  const color = resolveEventColor(
    occurrence.event.color,
    occurrence.calendar?.color,
    theme.colors.accent,
  );
  const cancelled = occurrence.event.status === 'cancelled';
  const titleLines = narrow
    ? Math.max(1, Math.floor(((layout?.height ?? 0) - 4) / NARROW_TITLE.lineHeight))
    : compact
      ? 1
      : 2;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${occurrence.event.title}, ${formatTimeOfDay(
        new Date(occurrence.start),
        timeZone,
        hourCycle,
      )}`}
      onPress={onPress}
      style={({ pressed }) => [
        layout
          ? {
              position: 'absolute',
              top: layout.top,
              height: layout.height,
              left: layout.left as unknown as number,
              width: layout.width as unknown as number,
            }
          : null,
        {
          flexDirection: 'row',
          gap: narrow ? 2 : theme.spacing.sm,
          overflow: 'hidden',
          borderRadius: theme.radius.sm,
          backgroundColor: pressed ? theme.colors.surfacePressed : withAlpha(color, 0.16),
          // A quarter-hour block in a week column is shorter than a padded
          // line, so there the title gets the whole height.
          paddingVertical:
            narrow && (layout?.height ?? Infinity) < 18 ? 0 : compact ? 2 : theme.spacing.xs,
          paddingRight: narrow ? 2 : theme.spacing.sm,
          opacity: cancelled ? 0.5 : 1,
        },
      ]}
    >
      <View style={{ width: narrow ? 2 : 3, alignSelf: 'stretch', backgroundColor: color }} />

      <View style={{ flex: 1, justifyContent: 'flex-start' }}>
        <Text
          variant={compact ? 'caption' : 'footnote'}
          numberOfLines={titleLines}
          style={{
            ...(narrow ? NARROW_TITLE : null),
            color: theme.colors.textPrimary,
            textDecorationLine: cancelled ? 'line-through' : 'none',
          }}
        >
          {occurrence.event.title}
        </Text>

        {!compact && !occurrence.event.allDay ? (
          <Text variant="caption" color="tertiary" numberOfLines={1}>
            {formatTimeOfDay(new Date(occurrence.start), timeZone, hourCycle)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
