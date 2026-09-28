import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Overrides the fill. Defaults to the success tone the web uses. */
  color?: string;
  /** Overrides the unchecked ring, e.g. to hint at priority or lateness. */
  ringColor?: string;
  /** A circle instead of the default rounded square. */
  round?: boolean;
  size?: number;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: ViewStyle;
  testID?: string;
}

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

/**
 * Completing a task is the most-repeated interaction in the app, so it gets a
 * deliberate two-part animation: the ring fills, and the tick scales in just
 * behind it. It reads as a single confident motion rather than a state swap.
 *
 * The box is a rounded square filled in the success tone, matching the web
 * client's `.taskCheckbox` rather than the circle iOS would default to.
 */
export function Checkbox({
  checked,
  onChange,
  color,
  ringColor,
  round = false,
  size = 20,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: CheckboxProps) {
  const theme = useTheme();
  const tint = color ?? theme.colors.success;
  const ring = ringColor ?? theme.colors.borderStrong;

  // Shared values set from an effect, not a derived value returning an
  // animation, so the box follows `checked` in both directions.
  const progress = useSharedValue(checked ? 1 : 0);
  const tickScale = useSharedValue(checked ? 1 : 0.4);
  const { duration, spring } = theme.motion;

  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, { duration: duration.fast });
    tickScale.value = withSpring(checked ? 1 : 0.4, spring);
  }, [checked, duration.fast, progress, spring, tickScale]);

  const boxStyle = useAnimatedStyle(() => ({
    borderColor: progress.value > 0.5 ? tint : ring,
  }));

  // The fill is its own layer that fades, rather than an animated
  // `backgroundColor`: Reanimated turns 'transparent' into 0, which the native
  // side drops, so an unticked box stayed filled.
  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const radius = round ? size / 2 : Math.max(4, Math.round(size * 0.24));

  const tickStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: tickScale.value }],
  }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      // Keep the visual box small but the target comfortably tappable.
      hitSlop={Math.max(0, (theme.hitSlopSize - size) / 2)}
      style={style}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: 1.5,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
          },
          boxStyle,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tint }, fillStyle]} />
        <AnimatedIonicons
          name="checkmark"
          size={size * 0.62}
          color={theme.colors.textInverse}
          style={tickStyle}
        />
      </Animated.View>
    </Pressable>
  );
}

/** Hairline used to strike through a completed task's title. */
export const strikeThroughStyle = StyleSheet.create({
  text: { textDecorationLine: 'line-through' },
}).text;
