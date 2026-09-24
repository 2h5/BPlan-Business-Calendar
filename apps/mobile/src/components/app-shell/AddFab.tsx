import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FAB_SIZE, TAB_BAR_CLEARANCE, TOAST_HEIGHT } from './floating-layout';
import { useQuickAddStore } from '../../store/quick-add.store';
import { useUndoStore } from '../../store/undo.store';

/**
 * The one add action, floating above the tab bar — Things' "Magic Plus"
 * idea. It opens Quick Add, and rises out of the way while an undo toast
 * occupies the same corner.
 */
export function AddFab() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const openQuickAdd = useQuickAddStore((state) => state.open);
  const toastShowing = useUndoStore((state) => state.pending !== null);

  const lift = useSharedValue(0);
  useEffect(() => {
    lift.value = withTiming(toastShowing ? -(TOAST_HEIGHT + theme.spacing.md) : 0, {
      duration: theme.motion.duration.base,
    });
  }, [lift, toastShowing, theme.motion.duration.base, theme.spacing.md]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          right: theme.spacing.lg,
          bottom: insets.bottom + TAB_BAR_CLEARANCE,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add"
        accessibilityHint="Opens Quick Add for a task, event, or time block"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          openQuickAdd('task');
        }}
        style={({ pressed }) => ({
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent,
          transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
          ...theme.elevation.popover,
        })}
      >
        <Ionicons name="add" size={30} color={theme.colors.onAccent} />
      </Pressable>
    </Animated.View>
  );
}
