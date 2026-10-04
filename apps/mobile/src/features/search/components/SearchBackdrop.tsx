import { useTheme } from '@cal/ui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SearchLineArt } from './SearchLineArt';

type StarKind = 'spark' | 'sparkOutline' | 'plus' | 'dot';

interface Star {
  kind: StarKind;
  /** Position in percent of the screen. */
  x: number;
  y: number;
  size: number;
  accent?: boolean;
}

/*
 * The web backdrop's edge marks — the ones it keeps on narrow screens — so the
 * field reads as scattered while the search column stays clear. A phone has
 * far less sky than a desktop, so a few are dropped and the largest are drawn
 * smaller than the web's.
 */
const STARS: Star[] = [
  { kind: 'plus', x: 7, y: 12, size: 10, accent: true },
  { kind: 'spark', x: 15, y: 5, size: 9 },
  { kind: 'dot', x: 10, y: 38, size: 4, accent: true },
  { kind: 'sparkOutline', x: 6, y: 50, size: 12 },
  { kind: 'spark', x: 8, y: 73, size: 11, accent: true },
  { kind: 'dot', x: 5, y: 81, size: 4 },
  { kind: 'spark', x: 14, y: 90, size: 11, accent: true },
  { kind: 'spark', x: 94, y: 7, size: 10, accent: true },
  { kind: 'dot', x: 85, y: 10, size: 4 },
  { kind: 'plus', x: 95, y: 33, size: 11 },
  { kind: 'spark', x: 89, y: 44, size: 10, accent: true },
  { kind: 'dot', x: 91, y: 66, size: 4 },
];

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const GLYPHS: Record<Exclude<StarKind, 'dot'>, IconName> = {
  spark: 'star-four-points',
  sparkOutline: 'star-four-points-outline',
  plus: 'plus',
};

/** Rings of the soft pool of light behind the search field, outermost first. */
const GLOW_RINGS = Array.from({ length: 12 }, (_, index) => 1 - index * 0.075);

/**
 * The decorative sky behind the Search screen — the same twinkling marks,
 * accent glow, and bottom-corner sketch as the web page, drawn with views and
 * icon glyphs.
 */
export function SearchBackdrop() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  // The web sizes the sketch to a quarter of a desktop; a phone gives it most
  // of the width, capped at the web's largest size.
  const artWidth = Math.min(Math.round(screenWidth * 0.72), 360);

  return (
    <Animated.View
      entering={FadeIn.duration(600 * theme.motion.scale)}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {/* React Native has no radial gradient without a native module, so the
          glow is stacked translucent ellipses; at these opacities the steps
          blend into one soft pool. */}
      <View style={styles.glow}>
        {GLOW_RINGS.map((scale) => (
          <View
            key={scale}
            style={[
              styles.glowRing,
              {
                // A circle stretched sideways: RN radii on a wide box make a
                // stadium, not an ellipse.
                width: 360 * scale,
                height: 360 * scale,
                top: -180 * scale,
                transform: [{ scaleX: 1.6 }],
                backgroundColor: theme.colors.accent,
                opacity: theme.scheme === 'dark' ? 0.009 : 0.007,
              },
            ]}
          />
        ))}
      </View>

      {STARS.map((star, index) => (
        <Twinkle key={index} star={star} index={index} />
      ))}

      <View
        style={{
          position: 'absolute',
          right: theme.spacing.md,
          bottom: insets.bottom + theme.spacing.sm,
        }}
      >
        <SearchLineArt width={artWidth} />
      </View>
    </Animated.View>
  );
}

function Twinkle({ star, index }: { star: Star; index: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);

  // Spread the twinkles so they never pulse together.
  const duration = (4000 + (index % 5) * 1000) * theme.motion.scale;
  const delay = Math.round(((index * 1.37) % 6) * 1000 * theme.motion.scale);

  useEffect(() => {
    if (reduceMotion) return;
    phase.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [delay, duration, phase, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0, 1], [1, 0.35]),
    transform: [{ scale: interpolate(phase.value, [0, 1], [1, 0.7]) }],
  }));

  const color = star.accent ? theme.colors.accent : theme.colors.textTertiary;
  // Icon glyphs carry padding inside their em box; scale up so the drawn mark
  // matches the web's size.
  const box = star.kind === 'dot' ? star.size : Math.round(star.size * 1.35);

  return (
    <Animated.View
      style={[
        styles.star,
        {
          left: `${star.x}%`,
          top: `${star.y}%`,
          width: box,
          height: box,
          marginLeft: -box / 2,
          marginTop: -box / 2,
          opacity: star.accent ? 0.8 : 0.7,
        },
      ]}
    >
      <Animated.View style={animatedStyle}>
        {star.kind === 'dot' ? (
          <View
            style={{ width: box, height: box, borderRadius: box / 2, backgroundColor: color }}
          />
        ) : (
          <MaterialCommunityIcons name={GLYPHS[star.kind]} size={box} color={color} />
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    overflow: 'hidden',
  },
  glowRing: {
    position: 'absolute',
    borderRadius: 9999,
  },
  star: {
    position: 'absolute',
  },
});
