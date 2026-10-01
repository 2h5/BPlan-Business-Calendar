import { useTheme } from '@cal/ui';
import { type ReactNode, useEffect } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';
import Animated, {
  Easing,
  LayoutAnimationConfig,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface AddTaskCardFrameProps {
  /** Height of the collapsed "Add a task" row the card grows out of and folds back into. */
  fromHeight: number;
  /** Set to fold the card back down; `onClosed` runs once it has. */
  closing: boolean;
  onClosed: () => void;
  children: ReactNode;
}

/**
 * The inline add-task card's chrome, with its height animated rather than
 * snapped. It opens by growing out of the collapsed row and follows its
 * contents from then on — a picker opening, an error appearing, the form
 * resetting after a capture — so nothing in the box ever jumps.
 *
 * Height is real layout, not a transform, so the task list beneath slides
 * down and back up with the card instead of jumping to its final place.
 */
export function AddTaskCardFrame({
  fromHeight,
  closing,
  onClosed,
  children,
}: AddTaskCardFrameProps) {
  const theme = useTheme();
  const height = useSharedValue(fromHeight);
  const contentOpacity = useSharedValue(0);

  const resize = {
    duration: theme.motion.duration.base,
    easing: Easing.bezier(...theme.motion.easing.standard),
  };
  // The border sits on the animated frame, outside the measured contents.
  const borderWidth = theme.borderWidth.hairline;

  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: theme.motion.duration.base });
  }, [contentOpacity, theme.motion.duration.base]);

  useEffect(() => {
    if (!closing) return;
    contentOpacity.value = withTiming(0, { duration: theme.motion.duration.fast });
    height.value = withTiming(fromHeight, resize, (finished) => {
      if (finished) runOnJS(onClosed)();
    });
    // `resize` is rebuilt every render from the same theme tokens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  const onContentLayout = (event: LayoutChangeEvent) => {
    if (closing) return;
    height.value = withTiming(event.nativeEvent.layout.height + borderWidth * 2, resize);
  };

  const frameStyle = useAnimatedStyle(() => ({ height: height.value }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  return (
    <Animated.View
      pointerEvents={closing ? 'none' : 'auto'}
      style={[
        {
          overflow: 'hidden',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth,
          borderColor: theme.colors.border,
        },
        frameStyle,
      ]}
    >
      {/* Measured at its natural height whatever the frame's current height. */}
      <View onLayout={onContentLayout}>
        <Animated.View style={[{ padding: theme.spacing.md, gap: theme.spacing.md }, contentStyle]}>
          {/* The card fades in as a whole; its pieces animate only on later changes. */}
          <LayoutAnimationConfig skipEntering>{children}</LayoutAnimationConfig>
        </Animated.View>
      </View>
    </Animated.View>
  );
}
