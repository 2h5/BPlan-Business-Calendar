import { useEffect, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Share of a page the finger must travel for a slow drag to turn it. */
const TURN_FRACTION = 0.25;
/** Flick speed, points per second, that turns the page regardless of distance. */
const FLICK_VELOCITY = 500;
const SLIDE = { duration: 280, easing: Easing.out(Easing.cubic) };

/**
 * Horizontal paging for the calendar views: the neighbouring pages follow the
 * finger, so a swipe shows the next month or week arriving rather than
 * snapping to it.
 *
 * Every page has a fixed slot on one long strip, measured from the page shown
 * when the view mounted — draw page `slot` at `left: slot * width` inside a
 * view given `stripStyle`. A finished swipe therefore leaves the strip exactly
 * where the new page already lives: nothing is reset or re-centred, which is
 * what would otherwise cause a one-frame jump.
 *
 * `index` is any integer that steps by one per page (months or weeks since an
 * epoch); `onChange` receives how many pages a finished turn moved.
 */
export function usePageSwipe(index: number, onChange: (delta: number) => void) {
  const [width, setWidth] = useState(0);
  const [baseIndex] = useState(index);
  const slot = index - baseIndex;

  // Strip position in pages, so a width change never needs re-deriving it.
  const position = useSharedValue(slot);
  const dragStart = useSharedValue(slot);
  /** The slot JS last settled on, so a turn reports a delta, not a guess. */
  const committed = useSharedValue(slot);
  const pageWidth = useSharedValue(0);

  // A swipe has already animated here by the time the index changes; only the
  // chevrons and "today" still need the strip moved.
  useEffect(() => {
    committed.value = slot;
    const distance = Math.abs(position.value - slot);
    if (distance < 0.001) return;
    // One page away the neighbour is already drawn, so it can slide in; any
    // further and the pages in between were never rendered, so jump.
    position.value = distance <= 1.001 ? withTiming(slot, SLIDE) : slot;
  }, [slot, committed, position]);

  const pan = Gesture.Pan()
    // Claim the touch only after clear horizontal travel, so taps still land
    // and a vertical drag (or a scroll) is never a page turn.
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    // A two-finger trackpad or mouse-wheel swipe arrives as scroll input, not
    // touches — without this only a finger (or click-drag) could turn a page.
    .enableTrackpadTwoFingerGesture(true)
    .onStart(() => {
      // Grabbing a page mid-slide continues from wherever it has got to.
      cancelAnimation(position);
      dragStart.value = position.value;
    })
    .onUpdate((event) => {
      if (pageWidth.value > 0) {
        position.value = dragStart.value - event.translationX / pageWidth.value;
      }
    })
    .onEnd((event) => {
      const from = Math.round(dragStart.value);
      const travelled = position.value - from;

      // A decisive flick wins over distance, so flicking back cancels a drag.
      let step = 0;
      if (event.velocityX < -FLICK_VELOCITY) step = 1;
      else if (event.velocityX > FLICK_VELOCITY) step = -1;
      else if (travelled > TURN_FRACTION) step = 1;
      else if (travelled < -TURN_FRACTION) step = -1;

      const target = from + step;
      position.value = withTiming(target, SLIDE, (finished) => {
        if (!finished) return;
        const delta = target - committed.value;
        if (delta === 0) return;
        committed.value = target;
        runOnJS(onChange)(delta);
      });
    });

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -position.value * pageWidth.value }],
  }));

  /** Attach to the clipping view whose width is one page. */
  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    setWidth(measured);
    pageWidth.value = measured;
  };

  return { pan, stripStyle, width, slot, onLayout };
}
