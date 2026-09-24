import { Text, useTheme } from '@cal/ui';
import { View, type ViewStyle } from 'react-native';

export interface ProgressRingProps {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
}

/**
 * A circular "done of total" meter.
 *
 * Drawn with plain Views — two half-rings, each rotated inside a mask that
 * shows one half of the circle — because the app has no SVG renderer and a
 * ring is not worth a native dependency.
 */
export function ProgressRing({ done, total, size = 52, stroke = 5 }: ProgressRingProps) {
  const theme = useTheme();
  const fraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const complete = total > 0 && done >= total;
  const color = theme.colors.success;

  const ring: ViewStyle = {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: stroke,
  };

  /** A half-ring on the given side of a full-size box that rotates about the ring's centre. */
  const halfArc = (side: 'left' | 'right', degrees: number, offsetLeft: number) => (
    <View
      style={{
        position: 'absolute',
        left: offsetLeft,
        width: size,
        height: size,
        transform: [{ rotate: `${degrees}deg` }],
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: side === 'left' ? 0 : size / 2,
          width: size / 2,
          height: size,
          overflow: 'hidden',
        }}
      >
        <View style={[ring, { left: side === 'left' ? 0 : -size / 2, borderColor: color }]} />
      </View>
    </View>
  );

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={total > 0 ? `${done} of ${total} tasks done` : 'No tasks today'}
      accessibilityValue={{ min: 0, max: Math.max(total, 1), now: done }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={[ring, { left: 0, borderColor: theme.colors.surfaceElevated }]} />

      {fraction > 0 ? (
        // The right half fills first: a left half-arc swings clockwise into view.
        <View
          style={{
            position: 'absolute',
            left: size / 2,
            width: size / 2,
            height: size,
            overflow: 'hidden',
          }}
        >
          {halfArc('left', Math.min(fraction, 0.5) * 360, -size / 2)}
        </View>
      ) : null}

      {fraction > 0.5 ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            width: size / 2,
            height: size,
            overflow: 'hidden',
          }}
        >
          {halfArc('right', (fraction - 0.5) * 360, 0)}
        </View>
      ) : null}

      <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
        {complete ? '✓' : total > 0 ? `${done}/${total}` : '–'}
      </Text>
    </View>
  );
}
