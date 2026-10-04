import { useTheme } from '@cal/ui';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style'];

/** The web artwork's viewBox; every coordinate below is in these units. */
const ART_WIDTH = 240;
const ART_HEIGHT = 170;
/** The magnifier group is laid out around the lens centre so it rotates about it. */
const LENS = { x: 160, y: 70, r: 22 };
const GROUP = 100;

/**
 * The idle-state artwork for Search: task and event cards under a magnifying
 * glass that scans across them — the web's `SearchIllustration`, drawn with
 * views because the app carries no SVG renderer.
 */
export function SearchIllustration({ width = 220 }: { width?: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const s = width / ART_WIDTH;
  const u = (value: number) => value * s;
  const isDark = theme.scheme === 'dark';

  const palette = {
    blob: isDark ? theme.colors.surfaceRaised : theme.colors.accentMuted,
    cardBack: isDark ? theme.colors.surfacePressed : theme.colors.surface,
    lineBack: isDark ? theme.colors.borderStrong : theme.colors.border,
    cardFront: isDark ? '#E9EEF6' : '#FFFFFF',
    lineFront: isDark ? '#A9B3C2' : '#C3CEDD',
  };

  const bob = useLoop(4800, reduceMotion);
  const bobSlow = useLoop(6000, reduceMotion);
  const scan = useLoop(6000, reduceMotion, false);
  const flicker = useLoop(3000, reduceMotion);
  const pulse = useLoop(3200, reduceMotion);
  const twinkle = useLoop(2600, reduceMotion);

  // Worklets cannot call `u`, so distances are scaled up front.
  const bobDistance = u(-5);
  const scanX = [0, -12, -5, 3, 0].map(u);
  const scanY = [0, 4, 9, 3, 0].map(u);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(bob.value, [0, 1], [0, bobDistance]) }],
  }));
  const floatSlowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(bobSlow.value, [0, 1], [bobDistance, 0]) }],
  }));
  // The web's `scan` keyframes: a small loop across the task card, tilting as it goes.
  const scanStyle = useAnimatedStyle(() => {
    const stops = [0, 0.3, 0.6, 0.8, 1];
    return {
      transform: [
        { translateX: interpolate(scan.value, stops, scanX) },
        { translateY: interpolate(scan.value, stops, scanY) },
        { rotate: `${interpolate(scan.value, stops, [0, -6, -2, 3, 0])}deg` },
      ],
    };
  });
  const flickerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(flicker.value, [0, 1], [1, 0.25]),
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [1, 0.45]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.6]) }],
  }));
  const pulseLateStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.45, 1]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1.6, 1]) }],
  }));
  const twinkleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(twinkle.value, [0, 1], [1, 0.4]),
    transform: [
      { scale: interpolate(twinkle.value, [0, 1], [1, 0.55]) },
      { rotate: `${interpolate(twinkle.value, [0, 1], [0, 45])}deg` },
    ],
  }));

  /** A rectangle in artwork units. */
  const box = (x: number, y: number, w: number, h: number, extra?: ViewStyle): ViewStyle => ({
    position: 'absolute',
    left: u(x),
    top: u(y),
    width: u(w),
    height: u(h),
    ...extra,
  });
  const line = (x: number, y: number, w: number, color: string) => (
    <View style={box(x, y, w, 4, { borderRadius: u(2), backgroundColor: color })} />
  );
  const dot = (cx: number, cy: number, r: number, color: string, style: AnimatedViewStyle) => (
    <Animated.View
      style={[
        box(cx - r, cy - r, r * 2, r * 2, { borderRadius: u(r), backgroundColor: color }),
        style,
      ]}
    />
  );
  const stroke = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    weight: number,
    color: string,
  ) => {
    const length = Math.hypot(x2 - x1, y2 - y1) + weight;
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return (
      <View
        style={box((x1 + x2) / 2 - length / 2, (y1 + y2) / 2 - weight / 2, length, weight, {
          borderRadius: u(weight / 2),
          backgroundColor: color,
          transform: [{ rotate: `${angle}deg` }],
        })}
      />
    );
  };
  const card = (x: number, y: number, w: number, h: number, fill: string, children: ReactNode) => (
    <View
      style={box(x, y, w, h, {
        borderRadius: u(7),
        backgroundColor: fill,
        borderWidth: isDark ? 0 : 1,
        borderColor: theme.colors.borderSubtle,
      })}
    >
      {/* Children use artwork coordinates, so offset them back to the origin. */}
      <View
        style={{
          position: 'absolute',
          left: -u(x) - (isDark ? 0 : 1),
          top: -u(y) - (isDark ? 0 : 1),
        }}
      >
        {children}
      </View>
    </View>
  );

  const g = (value: number, origin: number) => value - (origin - GROUP / 2);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: u(ART_HEIGHT) }}
    >
      {/* Soft backdrop */}
      <View
        style={box(44, 22, 160, 124, {
          borderRadius: u(62),
          backgroundColor: palette.blob,
          transform: [{ rotate: '-8deg' }],
        })}
      />

      {/* Decorations */}
      {dot(54, 42, 3.2, theme.colors.accent, pulseStyle)}
      {dot(58, 122, 2.6, theme.colors.textTertiary, pulseLateStyle)}
      <Animated.View
        style={[
          box(199, 57, 18, 18, { alignItems: 'center', justifyContent: 'center' }),
          twinkleStyle,
        ]}
      >
        <MaterialCommunityIcons name="star-four-points" size={u(18)} color={theme.colors.accent} />
      </Animated.View>

      {/* Back and event cards drift together, opposite the task card. */}
      <Animated.View style={[box(0, 0, ART_WIDTH, ART_HEIGHT), floatSlowStyle]}>
        {card(
          92,
          24,
          78,
          42,
          palette.cardBack,
          <>
            {line(104, 36, 34, palette.lineBack)}
            {line(104, 45, 22, palette.lineBack)}
          </>,
        )}
        {card(
          84,
          104,
          86,
          36,
          palette.cardBack,
          <>
            <View
              style={box(95, 114, 15, 15, {
                borderRadius: u(3),
                borderWidth: u(1.6),
                borderColor: theme.colors.textTertiary,
              })}
            />
            {stroke(95, 119, 110, 119, 1.6, theme.colors.textTertiary)}
            {stroke(99, 111, 99, 115, 1.6, theme.colors.textTertiary)}
            {stroke(106, 111, 106, 115, 1.6, theme.colors.textTertiary)}
            {line(118, 115, 40, palette.lineBack)}
            {line(118, 124, 26, palette.lineBack)}
          </>,
        )}
      </Animated.View>

      {/* Task card */}
      <Animated.View
        style={[
          box(66, 60, 100, 40, {
            borderRadius: u(7),
            backgroundColor: palette.cardFront,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: u(6) },
            shadowOpacity: isDark ? 0.28 : 0.1,
            shadowRadius: u(8),
          }),
          floatStyle,
        ]}
      >
        <View style={{ position: 'absolute', left: -u(66), top: -u(60) }}>
          <View
            style={box(77, 72, 16, 16, {
              borderRadius: u(4),
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="checkmark" size={u(13)} color={theme.colors.onAccent} />
          </View>
          {line(101, 73, 48, palette.lineFront)}
          {line(101, 83, 32, palette.lineFront)}
        </View>
      </Animated.View>

      {/* Magnifying glass, laid out around the lens centre so it tilts about it. */}
      <Animated.View style={[box(LENS.x - GROUP / 2, LENS.y - GROUP / 2, GROUP, GROUP), scanStyle]}>
        <Animated.View style={[box(0, 0, GROUP, GROUP), flickerStyle]}>
          {stroke(
            g(170, LENS.x),
            g(30, LENS.y),
            g(173, LENS.x),
            g(22, LENS.y),
            2,
            theme.colors.textTertiary,
          )}
          {stroke(
            g(181, LENS.x),
            g(36, LENS.y),
            g(188, LENS.x),
            g(31, LENS.y),
            2,
            theme.colors.textTertiary,
          )}
        </Animated.View>
        {stroke(
          g(177, LENS.x),
          g(87, LENS.y),
          g(194, LENS.x),
          g(104, LENS.y),
          10,
          theme.colors.accentPressed,
        )}
        <View
          style={box(
            GROUP / 2 - LENS.r - 3.25,
            GROUP / 2 - LENS.r - 3.25,
            (LENS.r + 3.25) * 2,
            (LENS.r + 3.25) * 2,
            {
              borderRadius: u(LENS.r + 3.25),
              borderWidth: u(6.5),
              borderColor: theme.colors.accent,
              backgroundColor: theme.colors.accentSubtle,
            },
          )}
        />
        {/* Glint */}
        {stroke(
          g(147, LENS.x),
          g(61, LENS.y),
          g(155, LENS.x),
          g(55, LENS.y),
          2.5,
          'rgba(255, 255, 255, 0.55)',
        )}
      </Animated.View>
    </View>
  );
}

/** A 0→1 progress value that loops for as long as motion is allowed. */
function useLoop(cycleMs: number, reduceMotion: boolean, mirror = true): SharedValue<number> {
  const duration = cycleMs * useTheme().motion.scale;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withRepeat(
      withTiming(1, {
        duration: mirror ? duration / 2 : duration,
        easing: mirror ? Easing.inOut(Easing.ease) : Easing.linear,
      }),
      -1,
      mirror,
    );
  }, [duration, mirror, progress, reduceMotion]);

  return progress;
}
