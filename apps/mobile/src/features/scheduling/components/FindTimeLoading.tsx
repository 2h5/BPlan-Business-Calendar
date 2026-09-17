import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** One sweep of the highlight across a card. */
const SHIMMER_MS = 1600;
/** Each row starts later than the one above it, so the three read as a queue. */
const ROW_STAGGER_MS = 200;
/** One turn of the badge's sparkle. */
const SPARKLE_MS = 3000;
/** Fraction of a card's width the travelling highlight covers. */
const BAND_FRACTION = 0.6;
/**
 * Slices standing in for the web's `linear-gradient` sweep. React Native has no
 * gradient without a native module the app does not carry, so the band is built
 * from steps on a sine ramp — at these opacities the steps are not visible, and
 * the alternative (one hard-edged bar) is.
 */
const BAND_SLICES = 12;

/**
 * What the box shows while the server is working: the same account of itself
 * the web page gives, over three placeholder rows shaped like the suggestions
 * that will replace them.
 *
 * Three, because that is exactly how many the box returns — a placeholder that
 * lies about the shape of the result is worse than none. The rows carry the
 * geometry of `SlotRow`, so nothing jumps when the real ones arrive.
 */
export function FindTimeLoading() {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    spin.value = withRepeat(withTiming(1, { duration: SPARKLE_MS, easing: Easing.linear }), -1);
  }, [reduceMotion, spin]);

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View
      accessibilityRole="progressbar"
      // Announced once, rather than narrating each placeholder row.
      accessibilityLabel="Finding the three best open slots"
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: theme.colors.accentSubtle,
        backgroundColor: theme.colors.accentMuted,
      }}
    >
      {/* The badge sits above the line rather than beside it, as it does on the
          web: at this width the two together leave the sentence three words to
          a line. */}
      <View style={{ gap: theme.spacing.xs, alignItems: 'flex-start' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingVertical: 3,
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.accentSubtle,
          }}
        >
          <Animated.View style={sparkleStyle}>
            <Ionicons name="sparkles" size={11} color={theme.colors.accent} />
          </Animated.View>
          <Text variant="caption" color="accent" uppercase>
            AI Engine
          </Text>
        </View>

        <Text variant="footnote" color="secondary">
          Verifying deterministic calendar availability &amp; ranking optimal slots…
        </Text>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        {[0, 1, 2].map((row) => (
          <SkeletonSlotRow key={row} delayMs={row * ROW_STAGGER_MS} />
        ))}
      </View>
    </View>
  );
}

/** A placeholder in the shape of one `SlotRow`: rank, two lines, action. */
function SkeletonSlotRow({ delayMs }: { delayMs: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();

  /** The card's width, which the highlight has to cross. */
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  const measure = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  };

  const bandWidth = width * BAND_FRACTION;
  const animating = width > 0 && !reduceMotion;

  useEffect(() => {
    if (!animating) return;
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withRepeat(withTiming(1, { duration: SHIMMER_MS, easing: Easing.inOut(Easing.quad) }), -1),
    );
  }, [animating, delayMs, progress]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -bandWidth + progress.value * (width + bandWidth) }],
  }));

  const block = {
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  } as const;

  return (
    <View
      onLayout={measure}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: theme.colors.borderSubtle,
        backgroundColor: theme.colors.surfaceRaised,
        overflow: 'hidden',
      }}
    >
      <View style={[block, { width: 24, height: 24, borderRadius: theme.radius.pill }]} />

      <View style={{ flex: 1, gap: 6 }}>
        <View style={[block, { width: '62%', height: 14 }]} />
        <View style={[block, { width: '88%', height: 10, opacity: 0.7 }]} />
      </View>

      <View style={[block, { width: 72, height: 26, borderRadius: theme.radius.md }]} />

      {animating ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, bottom: 0, left: 0, width: bandWidth },
            { flexDirection: 'row' },
            bandStyle,
          ]}
        >
          {Array.from({ length: BAND_SLICES }, (_, slice) => (
            <View
              key={slice}
              style={{ flex: 1, backgroundColor: sliceColor(theme.scheme, slice) }}
            />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * One step of the highlight, brightest in the middle and transparent at both
 * ends. Dark mode lifts the card with white; on a light card white would do
 * nothing, so the highlight there is a shadow rather than a sheen.
 */
function sliceColor(scheme: 'light' | 'dark', slice: number): string {
  const ramp = Math.sin((slice / (BAND_SLICES - 1)) * Math.PI);
  const peak = scheme === 'dark' ? 0.05 : 0.035;
  const channel = scheme === 'dark' ? '255, 255, 255' : '15, 19, 26';

  return `rgba(${channel}, ${(ramp * peak).toFixed(4)})`;
}
