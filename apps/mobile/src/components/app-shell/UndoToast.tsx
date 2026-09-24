import { Text, useTheme } from '@cal/ui';
import { useEffect } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_CLEARANCE } from './floating-layout';
import { useUndoStore } from '../../store/undo.store';

/**
 * The single "… · Undo" toast for deferred actions, mounted once at the root
 * so it survives the tab or sheet that triggered it.
 */
export function UndoToast() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pending = useUndoStore((state) => state.pending);
  const undo = useUndoStore((state) => state.undo);
  const flush = useUndoStore((state) => state.flush);

  // Leaving the app commits what was pending: a delete the user walked away
  // from is a delete, and a suspended timer might otherwise never fire.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flush();
    });
    return () => subscription.remove();
  }, [flush]);

  if (!pending) return null;

  return (
    <Animated.View
      key={pending.id}
      entering={FadeInDown.duration(theme.motion.duration.base)}
      exiting={FadeOutDown.duration(theme.motion.duration.fast)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: insets.bottom + TAB_BAR_CLEARANCE,
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingLeft: theme.spacing.lg,
          paddingRight: theme.spacing.xs,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.lg,
          borderWidth: theme.borderWidth.hairline,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          ...theme.elevation.popover,
        }}
      >
        <Text variant="callout" style={{ flex: 1 }} numberOfLines={1}>
          {pending.message}
        </Text>
        <Pressable
          onPress={undo}
          accessibilityRole="button"
          accessibilityLabel={`Undo: ${pending.message}`}
          hitSlop={theme.spacing.sm}
          style={({ pressed }) => ({
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent',
          })}
        >
          <Text variant="callout" color="accent" style={{ fontWeight: '600' }}>
            Undo
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
