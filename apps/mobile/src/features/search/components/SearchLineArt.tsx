import { useTheme } from '@cal/ui';
import { Fragment, useEffect, type ComponentProps, type ReactNode } from 'react';
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

/** The web sketch's viewBox is `0 -10 370 300`; coordinates below are in its units. */
const ART_WIDTH = 370;
const ART_HEIGHT = 300;
const ORIGIN_Y = -10;
const STROKE = 1.4;

type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style'];
type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point, Point];

/** The two dashed trails, as the web's cubic paths. */
const TOP_TRAIL: Curve = [
  [186, 34],
  [212, 4],
  [262, -2],
  [292, 22],
];
const SIDE_TRAIL: Curve = [
  [36, 150],
  [38, 194],
  [68, 232],
  [124, 248],
];

/** The web's `stroke-dasharray: 3 6` — one dash per 9 units of path. */
const DASH_PERIOD = 9;
const DASH_LENGTH = 3;
/** The web's dashes travel 90 units every 14s. */
const DASH_FLOW_MS = 14_000;
const DASH_FLOW_UNITS = 90;

/**
 * The loose sketch from the bottom of the web Search page — a search card, a
 * checklist, and a calendar, joined by dotted trails that flow between them.
 * Drawn with views, since the app carries no SVG renderer.
 */
export function SearchLineArt({ width }: { width: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const s = width / ART_WIDTH;
  const color = theme.colors.textTertiary;

  const flow = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    flow.value = withRepeat(withTiming(1, { duration: DASH_FLOW_MS, easing: Easing.linear }), -1);
  }, [flow, reduceMotion]);

  const driftA = useDrift(9000, 0, reduceMotion);
  const driftB = useDrift(11000, 4000, reduceMotion);
  const driftC = useDrift(8000, 2000, reduceMotion);
  const lift = -6 * s;
  const driftAStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(driftA.value, [0, 1], [0, lift]) }],
  }));
  const driftBStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(driftB.value, [0, 1], [0, lift]) }],
  }));
  const driftCStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(driftC.value, [0, 1], [0, lift]) }],
  }));

  const u = (value: number) => value * s;
  const outline = (x: number, y: number, w: number, h: number, radius: number): ReactNode => (
    <View
      style={{
        position: 'absolute',
        left: u(x),
        top: u(y - ORIGIN_Y),
        width: u(w),
        height: u(h),
        borderRadius: u(radius),
        borderWidth: STROKE,
        borderColor: color,
      }}
    />
  );
  const line = (x1: number, y1: number, x2: number, y2: number, opacity = 1): ReactNode => (
    <View style={[segmentStyle([x1, y1], [x2, y2], s, color), { opacity }]} />
  );
  const faint = (x: number, y: number, length: number) => line(x, y, x + length, y, 0.6);
  const dot = (cx: number, cy: number, r: number) => (
    <View
      style={{
        position: 'absolute',
        left: u(cx - r),
        top: u(cy - r - ORIGIN_Y),
        width: u(r * 2),
        height: u(r * 2),
        borderRadius: u(r),
        backgroundColor: color,
      }}
    />
  );
  /** A group turned about (cx, cy), as SVG's `rotate(deg cx cy)`. */
  const turned = (degrees: number, cx: number, cy: number, children: ReactNode) => {
    const dx = u(cx - ART_WIDTH / 2);
    const dy = u(cy - ORIGIN_Y - ART_HEIGHT / 2);
    return (
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: u(ART_WIDTH),
          height: u(ART_HEIGHT),
          transform: [
            { translateX: dx },
            { translateY: dy },
            { rotate: `${degrees}deg` },
            { translateX: -dx },
            { translateY: -dy },
          ],
        }}
      >
        {children}
      </View>
    );
  };
  const layer = (style: AnimatedViewStyle, children: ReactNode) => (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, style]}>
      {children}
    </Animated.View>
  );

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // The web draws the sketch at 42% of the tertiary text colour.
      style={{ width, height: u(ART_HEIGHT), opacity: 0.42 }}
    >
      <Trail curve={TOP_TRAIL} scale={s} color={color} flow={flow} />
      {dot(296, 26, 3.5)}
      <Trail curve={SIDE_TRAIL} scale={s} color={color} flow={flow} />
      {dot(122, 226, 2.5)}
      {dot(350, 44, 2)}

      {/* Search card */}
      {layer(
        driftAStyle,
        turned(
          -14,
          105,
          90,
          <>
            {outline(12, 50, 186, 82, 10)}
            {outline(38, 83, 16, 16, 8)}
            {line(52, 97, 59, 104)}
            {faint(76, 80, 90)}
            {faint(76, 92, 104)}
            {faint(76, 104, 70)}
          </>,
        ),
      )}

      {/* Checklist */}
      {layer(
        driftBStyle,
        turned(
          -20,
          190,
          190,
          <>
            {outline(122, 118, 140, 140, 10)}
            {[146, 178, 210].map((y, index) => (
              <Fragment key={y}>
                {outline(140, y, 14, 14, 3)}
                {line(143, y + 7, 147, y + 11, 0.8)}
                {index < 2 ? line(147, y + 11, 156, y, 0.8) : line(147, y + 11, 153, y + 4, 0.8)}
              </Fragment>
            ))}
            {faint(166, 150, 72)}
            {faint(166, 158, 52)}
            {faint(166, 182, 72)}
            {faint(166, 190, 40)}
            {faint(166, 214, 60)}
          </>,
        ),
      )}

      {/* Calendar */}
      {layer(
        driftCStyle,
        turned(
          -16,
          290,
          96,
          <>
            {outline(254, 60, 72, 68, 8)}
            {line(254, 78, 326, 78)}
            {line(272, 52, 272, 66)}
            {line(308, 52, 308, 66)}
            {faint(266, 94, 24)}
            {faint(266, 106, 40)}
          </>,
        ),
      )}
    </View>
  );
}

/**
 * A dotted trail whose dashes flow from one end to the other. Each dash rides
 * the cubic at its own offset, fading in and out at the ends where SVG would
 * clip it.
 */
function Trail({
  curve,
  scale,
  color,
  flow,
}: {
  curve: Curve;
  scale: number;
  color: string;
  flow: SharedValue<number>;
}) {
  const count = Math.max(1, Math.round(curveLength(curve) / DASH_PERIOD));

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Dash
          key={index}
          index={index}
          count={count}
          curve={curve}
          scale={scale}
          color={color}
          flow={flow}
        />
      ))}
    </>
  );
}

function Dash({
  index,
  count,
  curve,
  scale,
  color,
  flow,
}: {
  index: number;
  count: number;
  curve: Curve;
  scale: number;
  color: string;
  flow: SharedValue<number>;
}) {
  // Periods travelled per loop, so the dashes move at the web's speed.
  const periods = DASH_FLOW_UNITS / DASH_PERIOD;
  const [p0, p1, p2, p3] = curve;

  const style = useAnimatedStyle(() => {
    const t = ((index + flow.value * periods) % count) / count;
    const mt = 1 - t;
    const x =
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
    const y =
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
    const dx =
      3 * mt * mt * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
    const dy =
      3 * mt * mt * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);

    return {
      opacity: Math.min(1, t * count, (1 - t) * count),
      transform: [
        { translateX: (x - DASH_LENGTH / 2) * scale },
        { translateY: (y - ORIGIN_Y) * scale - STROKE / 2 },
        { rotate: `${Math.atan2(dy, dx)}rad` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: DASH_LENGTH * scale,
          height: STROKE,
          borderRadius: STROKE / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** A gentle up-and-down loop, started `delay` ms into its cycle. */
function useDrift(duration: number, delay: number, reduceMotion: boolean) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    // Start part-way through so the three groups never bob in step.
    const start = (delay % duration) / duration;
    progress.value = start < 0.5 ? start * 2 : 2 - start * 2;
    progress.value = withRepeat(
      withTiming(start < 0.5 ? 1 : 0, {
        duration: duration / 2,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [delay, duration, progress, reduceMotion]);

  return progress;
}

/** A straight stroke between two points, as a rotated rounded bar. */
function segmentStyle(from: Point, to: Point, scale: number, color: string): ViewStyle {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) * scale + STROKE;
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const cx = ((from[0] + to[0]) / 2) * scale;
  const cy = ((from[1] + to[1]) / 2 - ORIGIN_Y) * scale;

  return {
    position: 'absolute',
    left: cx - length / 2,
    top: cy - STROKE / 2,
    width: length,
    height: STROKE,
    borderRadius: STROKE / 2,
    backgroundColor: color,
    transform: [{ rotate: `${angle}rad` }],
  };
}

/** Approximate arc length of a cubic, from a polyline through it. */
function curveLength([p0, p1, p2, p3]: Curve): number {
  let length = 0;
  let previous: Point = p0;
  for (let step = 1; step <= 24; step += 1) {
    const t = step / 24;
    const mt = 1 - t;
    const point: Point = [
      mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0],
      mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1],
    ];
    length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    previous = point;
  }
  return length;
}
