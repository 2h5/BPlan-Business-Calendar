import { useTheme } from '@cal/ui';
import { type ReactNode, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface CollapsibleFieldProps {
  open: boolean;
  children: ReactNode;
}

/**
 * A form field that folds away instead of popping out — the time pickers
 * hidden by "All day". The same motion as a working-hours day being switched
 * on or off: the slot eases to the field's measured height while the field
 * fades and settles a few points into place, and the form beneath follows.
 *
 * The field stays mounted while folded so its value and layout are ready
 * the moment it reopens. It carries its own top spacing, so a folded field
 * leaves no gap behind in its parent.
 */
export function CollapsibleField({ open, children }: CollapsibleFieldProps) {
  const theme = useTheme();
  const expanded = useSharedValue(open ? 1 : 0);
  const contentHeight = useSharedValue(0);

  useEffect(() => {
    expanded.value = withTiming(open ? 1 : 0, {
      duration: open ? theme.motion.duration.base : theme.motion.duration.fast,
      easing: Easing.bezier(...theme.motion.easing.standard),
    });
  }, [
    open,
    expanded,
    theme.motion.duration.base,
    theme.motion.duration.fast,
    theme.motion.easing.standard,
  ]);

  const slotStyle = useAnimatedStyle(() => ({
    height: contentHeight.value * expanded.value,
    opacity: expanded.value,
    transform: [{ translateY: (1 - expanded.value) * theme.spacing.sm }],
  }));

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[{ overflow: 'hidden', position: 'relative' }, slotStyle]}
    >
      <View
        onLayout={(event) => {
          contentHeight.value = event.nativeEvent.layout.height;
        }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: theme.spacing.sm }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
