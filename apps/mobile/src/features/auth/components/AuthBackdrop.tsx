import { useTheme } from '@cal/ui';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
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

const CELL_W = 96;
const CELL_H = 48;
/** One row of drift per loop, as the web's `--period`. */
const PERIOD_MS = 24_000;

/**
 * Cells an event fills (column from the page centre, row from the top, height
 * in rows) and where in the loop it starts. Each stays hidden at the loop's
 * seam, so the grid's one-row jump back is never seen — as on the web.
 */
const EVENTS = [
  { col: -1, row: 14, span: 1, phase: 0 },
  { col: 1, row: 15, span: 1.5, phase: 0.55 },
  { col: 0, row: 17, span: 1, phase: 0.75 },
  { col: -2, row: 6, span: 1, phase: 0.95 },
] as const;

/**
 * Soft discs, outermost first, that stack into a radial glow. React Native has
 * no gradients, so a glow is a pile of translucent circles.
 */
const BLOOM_RINGS = Array.from({ length: 18 }, (_, index) => 1 - index / 18);
/** Each ring's share of the bloom's strength, so many thin steps blur into one. */
const RING_SHARE = 0.3;

/**
 * The sign-in backdrop, after the web login page: a faint week grid drifting
 * slowly upward, events softly filling a cell and fading, and two pale blue
 * blooms in opposite corners. The top of the page is kept clean paper so the
 * brand and headline read first.
 */
export function AuthBackdrop() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const dark = theme.scheme === 'dark';

  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    drift.value = withRepeat(
      withTiming(1, { duration: PERIOD_MS * theme.motion.scale, easing: Easing.linear }),
      -1,
    );
  }, [drift, reduceMotion, theme.motion.scale]);

  const gridStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -drift.value * CELL_H }],
  }));

  const columns = Math.ceil(width / CELL_W / 2) + 1;
  const rows = Math.ceil(height / CELL_H) + 2;
  const centreX = width / 2 - CELL_W / 2;
  const line = theme.colors.accent;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Bloom
        size={width * 1.1}
        x={width * 0.95}
        y={-width * 0.05}
        color={theme.colors.accent}
        strength={dark ? 0.05 : 0.035}
      />
      <Bloom
        size={width * 1.2}
        x={-width * 0.1}
        y={height * 0.95}
        color={theme.colors.accent}
        strength={dark ? 0.045 : 0.03}
      />

      <Animated.View
        style={[
          { position: 'absolute', left: 0, right: 0, top: 0, height: rows * CELL_H },
          gridStyle,
        ]}
      >
        {Array.from({ length: columns * 2 + 1 }, (_, index) => (
          <View
            key={`c${index}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: centreX + (index - columns) * CELL_W,
              width: StyleSheet.hairlineWidth,
              backgroundColor: line,
              opacity: dark ? 0.14 : 0.1,
            }}
          />
        ))}
        {Array.from({ length: rows }, (_, index) => (
          <View
            key={`r${index}`}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: index * CELL_H,
              height: StyleSheet.hairlineWidth,
              backgroundColor: line,
              opacity: dark ? 0.1 : 0.07,
            }}
          />
        ))}
        {EVENTS.map((event) => (
          <GridEvent
            key={`${event.col}:${event.row}`}
            left={centreX + event.col * CELL_W}
            top={event.row * CELL_H}
            span={event.span}
            phase={event.phase}
            drift={drift}
            still={reduceMotion}
          />
        ))}
      </Animated.View>

      {/* Clean paper behind the brand and headline. */}
      <Bloom
        size={width * 1.3}
        x={width / 2}
        y={height * 0.2}
        color={theme.colors.background}
        strength={0.22}
      />
    </View>
  );
}

function Bloom({
  size,
  x,
  y,
  color,
  strength,
}: {
  size: number;
  x: number;
  y: number;
  color: string;
  strength: number;
}) {
  return (
    <>
      {BLOOM_RINGS.map((scale) => (
        <View
          key={scale}
          style={{
            position: 'absolute',
            left: x - (size * scale) / 2,
            top: y - (size * scale) / 2,
            width: size * scale,
            height: size * scale,
            borderRadius: (size * scale) / 2,
            backgroundColor: color,
            opacity: strength * RING_SHARE,
          }}
        />
      ))}
    </>
  );
}

/** An event block that fills its cell for part of each loop, then fades. */
function GridEvent({
  left,
  top,
  span,
  phase,
  drift,
  still,
}: {
  left: number;
  top: number;
  span: number;
  phase: number;
  drift: SharedValue<number>;
  still: boolean;
}) {
  const theme = useTheme();

  const style = useAnimatedStyle(() => {
    if (still) return { opacity: 0.3 };
    const t = (drift.value + phase) % 1;
    // Hidden, in over 8–20%, held, out by 47% — the web's `event-fill`.
    return { opacity: interpolate(t, [0, 0.08, 0.2, 0.35, 0.47, 1], [0, 0, 0.6, 0.6, 0, 0]) };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: left + 5,
          top: top + 4,
          width: CELL_W - 10,
          height: span * CELL_H - 8,
          borderRadius: 6,
          borderLeftWidth: 2,
          borderLeftColor: theme.colors.accent,
          backgroundColor: theme.colors.accentSubtle,
          padding: 8,
        },
        style,
      ]}
    >
      <View
        style={{
          width: '44%',
          height: 4,
          borderRadius: 2,
          backgroundColor: theme.colors.accent,
          opacity: 0.3,
        }}
      />
    </Animated.View>
  );
}
