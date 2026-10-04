import { useTheme } from '@cal/ui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Artwork units; everything below is laid out in these and scaled to `width`. */
const ART = 200;
/** The calendar card, in its own (unrotated) units. */
const CAL = { x: 52, y: 34, w: 118, h: 110 };
const COLUMNS = 5;
const ROWS = 4;
/** The open slot Pro finds, low in the middle: column, row. */
const FOUND = { column: 2, row: 2 };
const CELL = 14;
const CELL_GAP = 4.5;
const BADGE = 56;
const TWINKLE_MS = 3200;
const FLOAT_MS = 5200;

/** Restrained fills and soft, cool shadows; nothing dark, no outlines. */
function palette(isDark: boolean) {
  return isDark
    ? {
        face: 'linear-gradient(180deg, #2B3550 0%, #252D3D 24%, #212835 40%, #1B212B 100%)',
        badge: 'linear-gradient(160deg, #2C3546 0%, #1F2531 100%)',
        cell: 'rgba(255, 255, 255, 0.06)',
        rim: 'rgba(255, 255, 255, 0.08)',
        edge: 'rgba(120, 165, 255, 0.16)',
        drop: 'rgba(0, 0, 0, 0.42)',
        ribbon: 0.1,
        ghost: 'rgba(255, 255, 255, 0.03)',
        sparkle: 'rgba(160, 190, 255, 0.32)',
        glow: 0.26,
      }
    : {
        face: 'linear-gradient(180deg, #E9F1FD 0%, #F4F8FE 22%, #FFFFFF 38%, #F3F6FB 100%)',
        badge: 'linear-gradient(160deg, #FFFFFF 0%, #EEF3FA 100%)',
        cell: '#EDF1F7',
        rim: 'rgba(255, 255, 255, 0.9)',
        edge: 'rgba(95, 145, 235, 0.16)',
        drop: 'rgba(55, 95, 170, 0.14)',
        ribbon: 0.07,
        ghost: 'rgba(255, 255, 255, 0.4)',
        sparkle: 'rgba(120, 150, 205, 0.3)',
        glow: 0.18,
      };
}

/**
 * The upgrade page's artwork: a soft, floating calendar card, tilted, with
 * one open slot lit in the accent — what Find Time does — and a Pro badge
 * overlapping its corner, its star the same shape as the sparkles around it. Behind them, a barely-there ribbon of tinted
 * light and a few faint sparkles fade into the page. Built from gradients and
 * box shadows only, so it follows the theme in both schemes. Two slow
 * motions: the badge floats, a sparkle twinkles.
 */
export function UpgradeIllustration({ width = 190 }: { width?: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const twinkle = useSharedValue(0);
  const float = useSharedValue(0);
  const u = (value: number) => (value * width) / ART;
  const c = palette(theme.scheme === 'dark');

  useEffect(() => {
    if (reduceMotion) return;
    const loop = (ms: number) =>
      withRepeat(
        withTiming(1, {
          duration: (ms / 2) * theme.motion.scale,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true,
      );
    twinkle.value = loop(TWINKLE_MS);
    float.value = loop(FLOAT_MS);
  }, [reduceMotion, twinkle, float, theme.motion.scale]);

  // Worklets cannot call `u`, so the distance is scaled up front.
  const floatDistance = u(-3);
  const twinkleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(twinkle.value, [0, 1], [1, 0.35]),
    transform: [{ scale: interpolate(twinkle.value, [0, 1], [1, 0.7]) }],
  }));
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, floatDistance]) }],
  }));

  const box = (x: number, y: number, w: number, h: number, extra?: ViewStyle): ViewStyle => ({
    position: 'absolute',
    left: u(x),
    top: u(y),
    width: u(w),
    height: u(h),
    ...extra,
  });

  /** A floating object: a wide, soft, cool shadow and a faint lit rim. */
  const lift = (drop: number): ViewStyle => ({
    boxShadow: [
      { offsetX: 0, offsetY: u(drop), blurRadius: u(drop * 3), color: c.drop },
      { offsetX: 0, offsetY: u(1.5), blurRadius: u(3), color: c.rim, inset: true },
      { offsetX: u(-1), offsetY: u(-1.5), blurRadius: u(4), color: c.edge, inset: true },
    ],
  });

  const accent = (alpha: number) => `rgba(25, 106, 243, ${alpha})`;
  const glow = (alpha: number) =>
    `radial-gradient(circle closest-side, ${accent(alpha)} 0%, ${accent(0)} 100%)`;
  /** A band of tinted light, soft on every edge, densest just off its middle. */
  const ribbon = (alpha: number) =>
    `radial-gradient(ellipse closest-side at 45% 50%, ${accent(alpha)} 0%, ${accent(alpha * 0.5)} 55%, ${accent(0)} 100%)`;

  const sparkle = (x: number, y: number, size: number) =>
    box(x, y, size, size, { alignItems: 'center', justifyContent: 'center' });

  const gridLeft = (CAL.w - (COLUMNS * CELL + (COLUMNS - 1) * CELL_GAP)) / 2;
  const gridTop = 32;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height: width }}
    >
      {/* The ribbon: two overlapping bands at slightly different angles, so
          its width swells and thins as it curves behind the calendar. */}
      <View
        style={box(-40, 104, 270, 46, {
          borderRadius: u(23),
          experimental_backgroundImage: ribbon(c.ribbon),
          transform: [{ rotate: '-24deg' }],
        })}
      />
      <View
        style={box(-20, 128, 230, 26, {
          borderRadius: u(13),
          experimental_backgroundImage: ribbon(c.ribbon * 0.8),
          transform: [{ rotate: '-34deg' }],
        })}
      />

      {/* Ambient light behind the calendar's lower right */}
      <View style={box(110, 70, 110, 110, { experimental_backgroundImage: glow(c.glow) })} />

      {/* A ghost card drifting far behind, top left */}
      <View
        style={box(8, 18, 46, 34, {
          borderRadius: u(10),
          backgroundColor: c.ghost,
          transform: [{ rotate: '14deg' }],
        })}
      />

      {/* The calendar: face, grid and rings turn together */}
      <View style={box(CAL.x, CAL.y, CAL.w, CAL.h, { transform: [{ rotate: '8deg' }] })}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: u(28),
            experimental_backgroundImage: c.face,
            ...lift(10),
          }}
        />

        {Array.from({ length: ROWS }, (_, row) =>
          Array.from({ length: COLUMNS }, (_, column) => {
            const found = row === FOUND.row && column === FOUND.column;
            return (
              <View
                key={`${row}-${column}`}
                style={box(
                  gridLeft + column * (CELL + CELL_GAP),
                  gridTop + row * (CELL + CELL_GAP),
                  CELL,
                  CELL,
                  found
                    ? {
                        borderRadius: u(4.5),
                        experimental_backgroundImage:
                          'linear-gradient(160deg, #4E8EF8 0%, #196AF3 100%)',
                        boxShadow: [
                          { offsetX: 0, offsetY: u(3), blurRadius: u(8), color: accent(0.32) },
                        ],
                      }
                    : { borderRadius: u(4.5), backgroundColor: c.cell },
                )}
              />
            );
          }),
        )}

        {/* Binder rings: short, thick tubes. Each leg drops into a soft
            shaded hole in the header; a pale line down the lit side and a
            deeper one down the shaded side give the tube its roundness. */}
        {[34, 70].map((x) => (
          <View key={x} style={box(x, -12, 15, 22)}>
            <View
              style={box(0.5, 18.5, 14, 4.5, {
                borderRadius: u(2.25),
                backgroundColor: accent(0.1),
                boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: u(2), color: accent(0.1) }],
              })}
            />
            <View
              style={{
                flex: 1,
                borderWidth: u(6),
                borderBottomWidth: 0,
                borderTopLeftRadius: u(7.5),
                borderTopRightRadius: u(7.5),
                borderColor: '#3E82F6',
              }}
            />
            <View
              style={box(1, 1, 13, 20, {
                borderWidth: u(1.6),
                borderBottomWidth: 0,
                borderTopLeftRadius: u(6.5),
                borderTopRightRadius: u(6.5),
                borderColor: 'transparent',
                borderLeftColor: 'rgba(175, 208, 255, 0.8)',
                borderTopColor: 'rgba(175, 208, 255, 0.8)',
              })}
            />
            <View
              style={box(0, 0, 15, 22, {
                borderWidth: u(1.8),
                borderBottomWidth: 0,
                borderTopLeftRadius: u(7.5),
                borderTopRightRadius: u(7.5),
                borderColor: 'transparent',
                borderRightColor: 'rgba(10, 65, 180, 0.35)',
              })}
            />
          </View>
        ))}
      </View>

      {/* The Pro badge, overlapping the calendar's lower-right corner */}
      <Animated.View style={[box(138, 120, BADGE, BADGE), floatStyle]}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: u(17),
            experimental_backgroundImage: c.badge,
            transform: [{ rotate: '-7deg' }],
            ...lift(9),
          }}
        >
          <MaterialCommunityIcons name="star-four-points" size={u(30)} color="#2F79F5" />
        </View>
      </Animated.View>

      {/* Sparkles: atmosphere, not icons */}
      <Animated.View style={[sparkle(150, 8, 9), twinkleStyle]}>
        <MaterialCommunityIcons name="star-four-points" size={u(9)} color={c.sparkle} />
      </Animated.View>
      <View style={sparkle(36, 76, 6)}>
        <MaterialCommunityIcons name="star-four-points" size={u(6)} color={c.sparkle} />
      </View>
      <View style={sparkle(104, 178, 8)}>
        <MaterialCommunityIcons name="star-four-points" size={u(8)} color={c.sparkle} />
      </View>
    </View>
  );
}
