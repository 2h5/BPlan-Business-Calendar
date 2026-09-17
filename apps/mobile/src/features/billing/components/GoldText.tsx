import { Text, type TextProps } from '@cal/ui';
import { useEffect, useState } from 'react';
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

/** The palette has no gold: it belongs to the places the app sells something. */
const GOLD = '#C9A227';
const GOLD_HIGHLIGHT = '#FFF3C0';

/** Width of the travelling highlight, in points. */
const SHEEN_WIDTH = 56;
/** How long the highlight takes to cross, whatever the gap between passes. */
const SWEEP_MS = 450;

export interface GoldTextProps {
  children: string;
  variant?: TextProps['variant'];
  /** Milliseconds from one reflection to the next. */
  cycleMs?: number;
}

/**
 * Gold text with a highlight that crosses it every `cycleMs`.
 *
 * A brighter copy of the same string is clipped to a narrow window that
 * travels across the text, while the copy slides the opposite way inside that
 * window so its letters stay registered with the gold ones underneath. That
 * gives a reflection through the glyphs without a gradient or mask library —
 * both of which are native modules this app does not carry.
 *
 * The copy is laid out at the full measured width; left to the window's width
 * it would be truncated, and the highlight would run out of letters partway.
 */
export function GoldText({ children, variant = 'body', cycleMs = 3000 }: GoldTextProps) {
  const [width, setWidth] = useState(0);
  // A shimmering advert is exactly what this setting is meant to silence.
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const animating = width > 0 && !reduceMotion;
  /** Crossing time is fixed, so a longer cycle only lengthens the wait. */
  const sweepFraction = Math.min(SWEEP_MS / cycleMs, 1);

  useEffect(() => {
    if (!animating) return;
    progress.value = 0;
    progress.value = withRepeat(withTiming(1, { duration: cycleMs, easing: Easing.linear }), -1);
  }, [animating, cycleMs, progress]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, sweepFraction, 1],
          [-SHEEN_WIDTH, width, width],
        ),
      },
    ],
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -interpolate(
          progress.value,
          [0, sweepFraction, 1],
          [-SHEEN_WIDTH, width, width],
        ),
      },
    ],
  }));

  return (
    <View
      style={{ alignSelf: 'flex-start' }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Text variant={variant} numberOfLines={1} style={{ color: GOLD }}>
        {children}
      </Text>

      {animating ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 0, bottom: 0, left: 0, width: SHEEN_WIDTH },
            { overflow: 'hidden' },
            bandStyle,
          ]}
        >
          <Animated.View style={[{ width, flexShrink: 0 }, highlightStyle]}>
            <Text variant={variant} numberOfLines={1} style={{ color: GOLD_HIGHLIGHT }}>
              {children}
            </Text>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}
