import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface TimeOfDayIconProps {
  isDaytime: boolean;
}

/** The halo reaches 70% of the icon's size past each edge, as the web's `inset: -70%`. */
const HALO_SPREAD = 0.7;
const BREATHE_MS = 6000;

/**
 * Concentric discs, outermost first, at the web gradient's stop positions, with
 * the opacity each adds. Stacked, they trace the web's radial gradient —
 * 26% of the icon colour at the centre, 8% at 38%, gone by 68% — which React
 * Native cannot draw without a native gradient module.
 */
const HALO_RINGS = [
  { radius: 0.68, opacity: 0.011 },
  { radius: 0.6, opacity: 0.021 },
  { radius: 0.52, opacity: 0.02 },
  { radius: 0.45, opacity: 0.019 },
  { radius: 0.38, opacity: 0.028 },
  { radius: 0.3, opacity: 0.038 },
  { radius: 0.22, opacity: 0.038 },
  { radius: 0.14, opacity: 0.035 },
  { radius: 0.07, opacity: 0.035 },
] as const;

/** The sun or moon beside "Today", with the web's softly breathing halo. */
export function TimeOfDayIcon({ isDaytime }: TimeOfDayIconProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) return;
    breath.value = 0;
    breath.value = withRepeat(
      withTiming(1, { duration: BREATHE_MS / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [breath, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.75, 1]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.94, 1.06]) }],
  }));

  const size = isDaytime ? 26 : 22;
  const color = isDaytime ? theme.colors.sun : theme.colors.moon;
  const halo = size * (1 + HALO_SPREAD * 2);

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: -size * HALO_SPREAD,
            top: -size * HALO_SPREAD,
            width: halo,
            height: halo,
            alignItems: 'center',
            justifyContent: 'center',
          },
          haloStyle,
        ]}
      >
        {HALO_RINGS.map(({ radius, opacity }) => (
          <View
            key={radius}
            style={{
              position: 'absolute',
              width: ringDiameter(halo, radius),
              height: ringDiameter(halo, radius),
              borderRadius: ringDiameter(halo, radius) / 2,
              backgroundColor: color,
              opacity,
            }}
          />
        ))}
      </Animated.View>

      <Ionicons
        name={isDaytime ? 'sunny' : 'moon'}
        size={size}
        color={color}
        accessibilityLabel={isDaytime ? 'Daytime' : 'Nighttime'}
        // The web's `drop-shadow(0 0 6px …35%)`: a glow hugging the glyph.
        style={{
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 6,
        }}
      />
    </View>
  );
}

/**
 * A CSS `radial-gradient(circle, …)` on a square box measures its stops
 * against the distance to the corner, half the diagonal, not half the side.
 */
function ringDiameter(box: number, stop: number): number {
  return box * stop * Math.SQRT2;
}
