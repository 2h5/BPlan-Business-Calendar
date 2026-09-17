import { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Tints the selected segment, e.g. a priority colour. */
  color?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  style?: ViewStyle;
}

/** Inset of the selected fill from the track, so the track frames it. */
const TRACK_PADDING = 3;
/**
 * How long the fill takes to cross, matching the billing toggle. Longer than
 * `motion.duration.base`, which is tuned for a fade: at 180ms a fill the eye
 * can follow across the track reads as a cut rather than a move.
 */
const SLIDE_MS = 260;
/**
 * A symmetric ease rather than `motion.easing.standard`. That curve front-loads
 * a transition, which is right for something appearing and wrong for something
 * travelling — it arrives before the eye has followed it.
 */
const SLIDE_EASING = Easing.inOut(Easing.cubic);

/**
 * A compact one-of-N picker for short, mutually exclusive choices such as
 * priority. Prefer `Chip` rows when the options are many or multi-select.
 *
 * The selection is one fill that slides between the segments rather than a
 * background each segment switches on and off: the movement is what says the
 * two choices are the same control, and where the selection went. One shared
 * `progress` value drives the fill's position, its width, its border tint and
 * every label's colour, so they cannot drift apart mid-flight the way separate
 * per-property animations can. Geometry is interpolated between the *measured*
 * segments — equal-width segments are the common case here but not a guarantee,
 * since a caller's labels may be any length.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  /** Measured segment geometry, indexed as in `options`. */
  const [segments, setSegments] = useState<{ x: number; width: number }[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  /** Where the fill sits, as a (fractional) index into `options`. */
  const progress = useSharedValue(selectedIndex);

  const measure = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setSegments((current) => {
      const existing = current[index];
      if (existing && existing.x === x && existing.width === width) return current;
      const next = [...current];
      next[index] = { x, width };
      return next;
    });
  };

  /**
   * Held until every segment has reported. `interpolate` also needs at least
   * two stops, so a one-option control never animates — it falls back to the
   * static selected styling below.
   */
  const ready =
    options.length > 1 &&
    segments.length === options.length &&
    options.every((_, index) => segments[index] !== undefined);

  useEffect(() => {
    // Before the segments are measured there is nothing to glide along, and
    // travel is exactly what Reduce Motion is meant to silence — so both cases
    // land on the new position without animating.
    if (!ready || reduceMotion) {
      progress.value = selectedIndex;
      return;
    }

    progress.value = withTiming(selectedIndex, { duration: SLIDE_MS, easing: SLIDE_EASING });
  }, [selectedIndex, ready, reduceMotion, progress]);

  const stops = options.map((_, index) => index);
  const tints = options.map((option) => option.color ?? theme.colors.accent);

  const fillStyle = useAnimatedStyle(() => {
    if (!ready) return {};

    return {
      width: interpolate(
        progress.value,
        stops,
        segments.map((segment) => segment.width),
      ),
      transform: [
        {
          translateX: interpolate(
            progress.value,
            stops,
            segments.map((segment) => segment.x),
          ),
        },
      ],
      // The tint travels with the fill, so a control whose options carry their
      // own colours changes colour over the same 260ms it changes place.
      borderColor: interpolateColor(progress.value, stops, tints),
    };
  });

  return (
    <View style={[{ gap: theme.spacing.xs }, style]}>
      {label ? (
        <Text variant="subhead" color="secondary">
          {label}
        </Text>
      ) : null}

      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          padding: TRACK_PADDING,
          gap: 3,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceRaised,
          borderWidth: theme.borderWidth.hairline,
          borderColor: theme.colors.borderSubtle,
        }}
      >
        {ready ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: TRACK_PADDING,
                bottom: TRACK_PADDING,
                left: 0,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
              },
              fillStyle,
            ]}
          />
        ) : null}

        {options.map((option, index) => {
          const selected = option.value === value;
          const tint = tints[index] ?? theme.colors.accent;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              onLayout={measure(index)}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 36,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                // Until the fill exists, the selected segment still has to look
                // selected — otherwise the control renders blank for a frame,
                // and a single-option control would never look selected at all.
                backgroundColor: !ready && selected ? theme.colors.surface : 'transparent',
                borderWidth: !ready && selected ? 1 : 0,
                borderColor: !ready && selected ? tint : 'transparent',
              }}
            >
              <SegmentLabel index={index} progress={progress} label={option.label} tint={tint} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * One segment's label, tinted from the same `progress` the fill travels on, so
 * it turns as the fill arrives instead of flipping colour the instant the
 * segment is pressed.
 *
 * Written against `Animated.Text` with the typography token applied by hand:
 * the shared `Text` cannot be wrapped by `createAnimatedComponent`, which needs
 * a forwarded ref to the underlying node.
 */
function SegmentLabel({
  index,
  progress,
  label,
  tint,
}: {
  index: number;
  progress: SharedValue<number>;
  label: string;
  tint: string;
}) {
  const theme = useTheme();

  const colorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      // 0 at this segment, 1 at any other — distance stands in for "how
      // selected am I", and reads the same whatever the segment count.
      Math.min(Math.abs(progress.value - index), 1),
      [0, 1],
      [tint, theme.colors.textSecondary],
    ),
  }));

  return (
    <Animated.Text numberOfLines={1} style={[theme.typography.subhead, colorStyle]}>
      {label}
    </Animated.Text>
  );
}
