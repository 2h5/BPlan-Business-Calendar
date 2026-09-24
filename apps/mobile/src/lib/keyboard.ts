import { useTheme } from '@cal/ui';
import { useAnimatedKeyboard, useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How far a bottom sheet's content has to rise to clear the on-screen keyboard.
 *
 * `BottomSheet` is anchored to the bottom of the screen, so without this the
 * keyboard covers a sheet's last fields and its buttons — in Quick Add, which
 * focuses its field on open, "More options" could not be reached at all. The
 * sheet already pads its bottom for the home indicator, so only the keyboard
 * beyond that padding needs lifting, plus a little air. Frame-synced with the
 * keyboard's own animation.
 *
 * Render `spacerStyle` on an `Animated.View` placed last in the sheet (after
 * its buttons). `collapseGap` cancels a flex gap the sheet puts before that
 * spacer, so a closed keyboard adds no space at all.
 */
export function useKeyboardLift(options?: { collapseGap?: number }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();

  const covered = insets.bottom + theme.spacing.lg;
  const air = theme.spacing.sm;
  const collapseGap = options?.collapseGap ?? 0;

  const lift = useDerivedValue(() =>
    keyboard.height.value > covered ? keyboard.height.value - covered + air : 0,
  );

  const spacerStyle = useAnimatedStyle(() => ({
    height: lift.value,
    marginTop: -collapseGap,
  }));

  return { lift, spacerStyle };
}
