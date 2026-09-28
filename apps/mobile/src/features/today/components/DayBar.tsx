import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Pressable, View, type ViewStyle } from 'react-native';

import { formatHourMark, type DayBarModel } from '../utils/day-bar';

export interface DayBarProps {
  model: DayBarModel;
  hourCycle: HourCycle;
  /** Opens the event behind a busy segment, by the segment's key. */
  onOpenSegment?: (key: string) => void;
  /** Spoken name for a busy segment, e.g. "Standup, 9:00 AM – 9:30 AM". */
  describeSegment?: (key: string) => string;
}

const BAR_HEIGHT = 10;
const LABEL_WIDTH = 32;
/** Events that have already ended recede so what is still ahead reads first. */
const PAST_OPACITY = 0.4;
/** The bar is thin; taps within this reach above and below still land on an event. */
const TAP_SLOP = 14;

/**
 * The day at a glance as one horizontal strip: events as solid blocks in
 * their calendar's colour, free working time as open outlined slots between
 * them, and a tick for now. Free time is an outline rather than a fill so it
 * cannot be mistaken for an event, whatever colour a calendar uses. Layout is
 * decided by `buildDayBar`; this only draws it.
 */
export function DayBar({ model, hourCycle, onOpenSegment, describeSegment }: DayBarProps) {
  const theme = useTheme();

  const freeSlot: ViewStyle = {
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successSubtle,
  };

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View
        style={{
          height: BAR_HEIGHT,
          borderRadius: BAR_HEIGHT / 2,
          backgroundColor: theme.colors.surfaceElevated,
        }}
      >
        {model.segments.map((segment) => {
          const style: ViewStyle[] = [
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${segment.left}%`,
              width: `${segment.width}%`,
              borderRadius: 3,
            },
            segment.kind === 'free'
              ? freeSlot
              : {
                  backgroundColor: segment.color ?? theme.colors.accent,
                  opacity: segment.past ? PAST_OPACITY : 1,
                },
          ];

          if (segment.kind === 'busy' && onOpenSegment) {
            const label = describeSegment?.(segment.key);
            return (
              <Pressable
                key={segment.key}
                accessibilityRole="button"
                accessibilityLabel={label ? `Open ${label}` : 'Open event'}
                hitSlop={{ top: TAP_SLOP, bottom: TAP_SLOP }}
                onPress={() => onOpenSegment(segment.key)}
                style={({ pressed }) => [
                  ...style,
                  pressed ? { opacity: (segment.past ? PAST_OPACITY : 1) * 0.6 } : null,
                ]}
              />
            );
          }
          return (
            <View
              key={segment.key}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={style}
            />
          );
        })}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            top: -3,
            height: BAR_HEIGHT + 6,
            width: 2,
            marginLeft: -1,
            left: `${model.nowPercent}%`,
            borderRadius: 1,
            backgroundColor: theme.colors.nowIndicator,
          }}
        />
      </View>

      <View style={{ height: 16 }}>
        {model.labels.map((label, index) => {
          const first = index === 0;
          const last = index === model.labels.length - 1;
          return (
            <Text
              key={label.minute}
              variant="footnote"
              color="tertiary"
              style={{
                position: 'absolute',
                fontSize: 11,
                width: LABEL_WIDTH,
                // Ends sit flush with the bar; the rest centre on their hour.
                ...(last
                  ? { right: 0, textAlign: 'right' }
                  : {
                      left: `${label.percent}%`,
                      marginLeft: first ? 0 : -LABEL_WIDTH / 2,
                      textAlign: first ? 'left' : 'center',
                    }),
              }}
            >
              {formatHourMark(label.minute, hourCycle)}
            </Text>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <LegendKey swatch={[{ width: 12, height: 8, borderRadius: 2 }, freeSlot]} label="Free" />
        <LegendKey
          swatch={{
            width: 2,
            height: 10,
            borderRadius: 1,
            backgroundColor: theme.colors.nowIndicator,
          }}
          label="Now"
        />
      </View>
    </View>
  );
}

function LegendKey({ swatch, label }: { swatch: ViewStyle | ViewStyle[]; label: string }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <View style={swatch} />
      <Text variant="footnote" color="tertiary" style={{ fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}
