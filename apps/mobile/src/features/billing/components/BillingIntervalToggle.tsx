import { Text, useTheme } from '@cal/ui';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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

export type BillingInterval = 'monthly' | 'annual';

export interface BillingIntervalToggleProps {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
  /** Whole percent saved by paying annually, e.g. 17 for "Save 17%". */
  savingsPercentage: number;
}

const OPTIONS: readonly BillingInterval[] = ['monthly', 'annual'];
const LABELS: Record<BillingInterval, string> = {
  monthly: 'Monthly billing',
  annual: 'Annual billing',
};

/** Inset of the fill from the track, so the track reads as a border around it. */
const TRACK_PADDING = 3;
/**
 * How long the fill takes to cross. Longer than `motion.duration.base`: the
 * two segments are far from the same width, so the fill both travels and
 * resizes, and at 180ms that reads as a cut rather than a move.
 */
const SLIDE_MS = 260;
/**
 * A symmetric ease rather than `motion.easing.standard`. That curve is built to
 * front-load a transition — measured on the simulator it spent two thirds of
 * the travel in the first 40ms — which is right for a fade but reads as a snap
 * on something the eye can follow across the track.
 */
const SLIDE_EASING = Easing.inOut(Easing.cubic);

/**
 * The monthly/annual picker above the Pro price, matching the web
 * subscription page: two segments in a pill, the selected one filled with
 * accent, and the saving called out on the annual side.
 *
 * `SegmentedControl` would have been the obvious reuse, but its options are
 * plain strings and the annual segment has to carry the savings pill — the one
 * thing that makes the choice worth reading.
 *
 * One shared `progress` value drives everything: the fill's position, its
 * width, and both label colours are read from the same number, so they cannot
 * drift apart mid-flight the way separate per-property animations can. The
 * fill's geometry is interpolated between the measured segments rather than
 * assumed — the labels differ in length, and the annual one also carries the
 * pill, so the two segments are nowhere near equal width.
 */
export function BillingIntervalToggle({
  value,
  onChange,
  savingsPercentage,
}: BillingIntervalToggleProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  /** Measured segment geometry, indexed as in `OPTIONS`. */
  const [segments, setSegments] = useState<{ x: number; width: number }[]>([]);
  /** Where the fill sits, as a (fractional) index into `OPTIONS`. */
  const progress = useSharedValue(OPTIONS.indexOf(value));

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

  /** Held until both segments have reported, so the fill never starts misplaced. */
  const ready =
    segments.length === OPTIONS.length &&
    OPTIONS.every((_, index) => segments[index] !== undefined);

  const selectedIndex = OPTIONS.indexOf(value);

  useEffect(() => {
    // Before the segments are measured there is nothing to glide along, and a
    // shimmering advert is exactly what Reduce Motion is meant to silence — so
    // both cases land on the new position without animating.
    if (!ready || reduceMotion) {
      progress.value = selectedIndex;
      return;
    }

    progress.value = withTiming(selectedIndex, { duration: SLIDE_MS, easing: SLIDE_EASING });
  }, [selectedIndex, ready, reduceMotion, progress]);

  /** `interpolate` needs at least two stops; with two segments these are [0, 1]. */
  const stops = OPTIONS.map((_, index) => index);

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
    };
  });

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Billing frequency"
      style={{
        alignSelf: 'center',
        flexDirection: 'row',
        padding: TRACK_PADDING,
        borderRadius: theme.radius.pill,
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
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.accent,
            },
            fillStyle,
          ]}
        />
      ) : null}

      {OPTIONS.map((option, index) => {
        const isSelected = option === value;

        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={
              option === 'annual'
                ? `${LABELS.annual}, save ${savingsPercentage} percent`
                : LABELS.monthly
            }
            onPress={() => onChange(option)}
            onLayout={measure(index)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              minHeight: 36,
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radius.pill,
            }}
          >
            <SegmentLabel index={index} progress={progress} label={LABELS[option]} />

            {option === 'annual' ? (
              // The tinted-wash treatment the rest of the app gives a success
              // badge, rather than a solid fill: quieter next to the accent the
              // selected segment already carries, and still its own colour
              // whichever segment is selected.
              <View
                style={{
                  paddingHorizontal: theme.spacing.sm,
                  paddingVertical: 2,
                  borderRadius: theme.radius.pill,
                  overflow: 'hidden',
                  // The success wash is translucent, so it takes its colour
                  // from whatever it sits on — and the fill slides under this
                  // pill. Standing it on the track's own colour keeps the pill
                  // identical whichever segment is selected.
                  backgroundColor: theme.colors.surfaceRaised,
                }}
              >
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { backgroundColor: theme.colors.successSubtle },
                  ]}
                />
                <Text variant="caption" color="success" numberOfLines={1}>
                  {`Save ${savingsPercentage}%`}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
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
}: {
  index: number;
  progress: SharedValue<number>;
  label: string;
}) {
  const theme = useTheme();

  const colorStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      // 0 at this segment, 1 at any other — distance stands in for "how
      // selected am I", and reads the same whatever the segment count.
      Math.min(Math.abs(progress.value - index), 1),
      [0, 1],
      [theme.colors.onAccent, theme.colors.textSecondary],
    ),
  }));

  return (
    <Animated.Text numberOfLines={1} style={[theme.typography.subhead, colorStyle]}>
      {label}
    </Animated.Text>
  );
}
