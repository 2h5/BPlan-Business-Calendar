import { useTheme } from '@cal/ui';
import { useEffect, useState } from 'react';
import type { ViewStyle } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** How long a finished request waits for a follow-up before the box resets. */
export const FOLLOW_UP_MS = 12_000;
/** The close-up: results fold into the bar before it resets. */
export const CLOSE_MS = 320;

export interface UseFindTimeAutoCloseOptions {
  /** A booking or move completed. */
  finished: boolean;
  /** The field has focus — the user may be about to ask for more, so the wait pauses. */
  focused: boolean;
  /** Clears the text and every flow once the close-up has played. */
  reset: () => void;
  /** Folds the box away after it resets; without it the box clears in place. */
  onFinished?: () => void;
}

export interface FindTimeAutoClose {
  isClosing: boolean;
  /** Measured results height, written by the results container's `onLayout`. */
  resultsHeight: SharedValue<number>;
  /** Animated style for the results while they close up. */
  closingStyle: ViewStyle;
  /** Animated style that fades the typed text as the bar empties. */
  fieldStyle: ViewStyle;
}

/**
 * After a booking or a move, the box offers to help again; if the user
 * neither types nor taps into the field in time, the results close up into
 * the bar, then everything clears and the box folds away. Typing resets the
 * finished state, and focusing pauses the wait.
 */
export function useFindTimeAutoClose({
  finished,
  focused,
  reset,
  onFinished,
}: UseFindTimeAutoCloseOptions): FindTimeAutoClose {
  const theme = useTheme();
  const closing = useSharedValue(0);
  const resultsHeight = useSharedValue(0);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!finished || focused) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const closeMs = CLOSE_MS * theme.motion.scale;
    const timer = setTimeout(() => {
      setIsClosing(true);
      closing.value = withTiming(1, {
        duration: closeMs,
        easing: Easing.bezier(...theme.motion.easing.standard),
      });
      settle = setTimeout(() => {
        reset();
        // Folding away unmounts the box; leave it closed so no frame can show
        // the results again before React removes them.
        if (onFinished) onFinished();
        else setIsClosing(false);
      }, closeMs);
    }, FOLLOW_UP_MS);
    return () => {
      clearTimeout(timer);
      if (settle) clearTimeout(settle);
    };
  }, [
    finished,
    focused,
    onFinished,
    reset,
    closing,
    theme.motion.easing.standard,
    theme.motion.scale,
  ]);

  // Reopen only after React has committed the cleared state, for the same reason.
  useEffect(() => {
    if (!isClosing) closing.value = 0;
  }, [isClosing, closing]);

  // Height is animated only while closing; otherwise the results size to their
  // content. The typed text fades with them so the bar empties as it closes.
  // Padding shrinks with the height: layout never lets a box be shorter than
  // its padding, so a fixed gap would jump the page when the box unmounts.
  const resultsGap = theme.spacing.md;
  const closingStyle = useAnimatedStyle(() => ({
    height: resultsHeight.value * (1 - closing.value),
    paddingTop: resultsGap * (1 - closing.value),
    opacity: 1 - closing.value,
  }));
  const fieldStyle = useAnimatedStyle(() => ({ opacity: 1 - closing.value }));

  return { isClosing, resultsHeight, closingStyle, fieldStyle };
}
