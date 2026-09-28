import { useTheme } from '@cal/ui';
import { View, type ViewStyle } from 'react-native';

export interface BrandLogoProps {
  /** Edge length in points; the mark is drawn on a 32-unit grid. */
  size?: number;
}

type Point = readonly [number, number];

const CHECK: readonly [Point, Point, Point] = [
  [10, 20],
  [14, 24],
  [22, 15],
];
const STROKE = 2.4;

/**
 * The web sidebar's calendar-check mark — a rounded page with a header band,
 * two binder tabs and a tick — drawn with views, since the app carries no SVG
 * renderer.
 */
export function BrandLogo({ size = 32 }: BrandLogoProps) {
  const theme = useTheme();
  const u = (value: number) => (value * size) / 32;
  const stroke = u(STROKE);

  const tab = (x: number): ViewStyle => ({
    position: 'absolute',
    left: u(x) - stroke / 2,
    top: u(2),
    width: stroke,
    height: u(6),
    borderRadius: stroke / 2,
    backgroundColor: theme.colors.accent,
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <View
        style={{
          position: 'absolute',
          left: u(3),
          top: u(5),
          width: u(26),
          height: u(24),
          borderRadius: u(6),
          backgroundColor: theme.colors.accent,
          overflow: 'hidden',
        }}
      >
        {/* The header band, a faint line where the page's top is folded over. */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: u(12 - 5) - u(1),
            height: u(2),
            backgroundColor: theme.colors.onAccent,
            opacity: 0.35,
          }}
        />
      </View>
      <View style={tab(10)} />
      <View style={tab(22)} />
      <View style={segment(CHECK[0], CHECK[1], u, stroke, theme.colors.onAccent)} />
      <View style={segment(CHECK[1], CHECK[2], u, stroke, theme.colors.onAccent)} />
    </View>
  );
}

/** A round-capped stroke between two grid points, as a rotated bar. */
function segment(
  from: Point,
  to: Point,
  u: (value: number) => number,
  stroke: number,
  color: string,
): ViewStyle {
  const length = u(Math.hypot(to[0] - from[0], to[1] - from[1])) + stroke;
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);

  return {
    position: 'absolute',
    left: u((from[0] + to[0]) / 2) - length / 2,
    top: u((from[1] + to[1]) / 2) - stroke / 2,
    width: length,
    height: stroke,
    borderRadius: stroke / 2,
    backgroundColor: color,
    transform: [{ rotate: `${angle}rad` }],
  };
}
