import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pinned actions below the scrolling body. */
  footer?: ReactNode;
  /** Drag distance, in points, that dismisses the sheet. */
  dismissThreshold?: number;
  contentStyle?: ViewStyle;
}

/**
 * The app's primary create/edit surface. Quick Add, the event editor, and the
 * task editor all compose this rather than pushing a full screen, which keeps
 * capture fast and the context behind it visible.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  dismissThreshold = 120,
  contentStyle,
}: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);

  const translateY = useSharedValue(viewportHeight);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = viewportHeight;
      backdrop.value = 0;
      setMounted(true);

      const frame = requestAnimationFrame(() => {
        translateY.value = withTiming(0, {
          duration: theme.motion.duration.slow,
          easing: Easing.bezier(...theme.motion.easing.decelerate),
        });
        backdrop.value = withTiming(1, { duration: theme.motion.duration.base });
      });

      return () => cancelAnimationFrame(frame);
    }

    backdrop.value = withTiming(0, { duration: theme.motion.duration.fast });
    translateY.value = withTiming(
      viewportHeight,
      {
        duration: theme.motion.duration.base,
        easing: Easing.bezier(...theme.motion.easing.accelerate),
      },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [
    visible,
    backdrop,
    translateY,
    viewportHeight,
    theme.motion.duration.base,
    theme.motion.duration.fast,
    theme.motion.duration.slow,
    theme.motion.easing.accelerate,
    theme.motion.easing.decelerate,
  ]);

  const pan = Gesture.Pan()
    .onChange((event) => {
      translateY.value = Math.max(0, translateY.value + event.changeY);
    })
    .onEnd((event) => {
      if (translateY.value > dismissThreshold || event.velocityY > 900) {
        runOnJS(onClose)();
      } else {
        translateY.value = withTiming(0, {
          duration: theme.motion.duration.base,
          easing: Easing.bezier(...theme.motion.easing.decelerate),
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.scrim }]}
          />
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                backgroundColor: theme.colors.backgroundElevated,
                borderTopLeftRadius: theme.radius.xxl,
                borderTopRightRadius: theme.radius.xxl,
                paddingBottom: insets.bottom + theme.spacing.lg,
                ...theme.elevation.sheet,
              },
              sheetStyle,
            ]}
          >
            <View style={[styles.grabberArea, { paddingVertical: theme.spacing.md }]}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.borderStrong,
                }}
              />
            </View>

            {title ? (
              <View
                style={{ paddingHorizontal: theme.screenPadding, paddingBottom: theme.spacing.md }}
              >
                <Text variant="title2">{title}</Text>
              </View>
            ) : null}

            <View
              style={[
                { paddingHorizontal: theme.screenPadding, gap: theme.spacing.lg },
                contentStyle,
              ]}
            >
              {children}
            </View>

            {footer ? (
              <View
                style={{
                  paddingHorizontal: theme.screenPadding,
                  paddingTop: theme.spacing.lg,
                }}
              >
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  grabberArea: { alignItems: 'center' },
});
