import { useTheme } from '@cal/ui';
import { useEffect, useRef, useState } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * What the Find Time bar suggests typing. Each names a meeting and a when, the
 * way the engine wants to be asked, and each stays short enough to fit the
 * phone-width bar without an ellipsis.
 */
export const FIND_TIME_EXAMPLES = [
  'Coffee with Pat Friday',
  'Team meeting 10am',
  'Lunch with Sam Monday',
  'Call with Jo next week',
  'Dentist Tuesday 9am',
  'Gym this weekend',
] as const;

const INTERVAL_MS = 10_000;

/** How an example reads, folded or open — one string so the two never differ. */
export function formatExample(example: string): string {
  return `Try “${example}”`;
}

/**
 * Cycles the examples every ten seconds, fading the old one out before the
 * next fades in. Reanimated's default reduce-motion handling turns the fade
 * into an instant swap for people who have asked for less motion. Paused, it
 * holds the current example — an open field should not change under a user
 * who is about to type.
 */
export function useRotatingExample(paused = false) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const opacity = useSharedValue(1);
  const swap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = theme.motion.duration.slow;

  // While paused the folded bar is not on screen, so its example is held
  // hidden; coming back (the box folding away) fades it in rather than letting
  // it appear for a frame first. The very first render just shows it.
  const wasPaused = useRef(paused);
  useEffect(() => {
    if (paused) {
      opacity.value = 0;
      wasPaused.current = true;
      return;
    }
    if (wasPaused.current) {
      wasPaused.current = false;
      opacity.value = withTiming(1, { duration: fade });
    }

    const interval = setInterval(() => {
      opacity.value = withTiming(0, { duration: fade });
      swap.current = setTimeout(() => {
        setIndex((current) => (current + 1) % FIND_TIME_EXAMPLES.length);
        opacity.value = withTiming(1, { duration: fade });
      }, fade);
    }, INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (swap.current) clearTimeout(swap.current);
    };
  }, [fade, opacity, paused]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return { example: formatExample(FIND_TIME_EXAMPLES[index] ?? FIND_TIME_EXAMPLES[0]), style };
}
