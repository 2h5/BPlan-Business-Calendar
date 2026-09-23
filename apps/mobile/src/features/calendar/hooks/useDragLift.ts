import * as Haptics from 'expo-haptics';
import { useCallback, type RefObject } from 'react';
import type { ViewStyle } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** How long a finger must rest on an event before it lifts out of the grid. */
export const PICK_UP_MS = 220;
const LIFT = { damping: 18, stiffness: 220 };
const RETURN = { duration: 140 };

export interface DragLift {
  /** Live offset while the finger is down. */
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;
  /** True between pick-up and release; drives the time or date readout. */
  dragging: SharedValue<boolean>;
  /** 0 flat in the grid, 1 fully lifted; each view's gesture springs it. */
  lifted: SharedValue<number>;
  /** Style for the wrapper: the offset, the lift, and the shadow under it. */
  style: ReturnType<typeof useAnimatedStyle<ViewStyle>>;
  /** Call from `onStart`, through `runOnJS`. */
  pickedUp: () => void;
  /** Call from `onFinalize`, through `runOnJS`. */
  putDown: () => void;
  /** Call through `runOnJS` each time the drop target moves to a new slot. */
  slotChanged: () => void;
  /** Hand a finished drag's offset over to the commit, from `onEnd`. */
  settle: (commit: () => Promise<void>) => void;
  /**
   * Slide back to where it started, for a drag that changed nothing. A worklet,
   * so a gesture's `onEnd` calls it directly.
   */
  cancel: () => void;
  /** Apply Gesture Handler's relations, whatever shape the callers pass. */
  applyBlocking: (gesture: GestureType, blocking?: (RefObject<unknown> | GestureType)[]) => void;
}

/**
 * The parts of picking an event up that every calendar view shares: the lift,
 * the shadow, the haptic, and the offset a dropped event holds on to.
 *
 * That last part is the reason this is a hook rather than a style. A drop must
 * leave the event *where it was dropped* while the write goes out — releasing
 * the offset the moment the finger lifts would snap it back to its old place
 * for the frame or two the round trip takes, which reads as the drag having
 * failed. So the live offset is handed to a second pair of values at release
 * and only surrendered once the write has settled and the props carry the new
 * time.
 *
 * What a drag *means* is left to each view: the hour grid reads minutes and
 * day columns out of the gesture, the month grid reads whole dates.
 *
 * Gesture callbacks must take the functions they need off the returned object
 * rather than calling `lift.x()`: a worklet captures what it references, and
 * capturing the whole object would carry `style` — a live animated-style handle
 * — onto the UI thread, which Reanimated warns about on every style update.
 */
export function useDragLift(onDragChange?: (dragging: boolean) => void): DragLift {
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const settledX = useSharedValue(0);
  const settledY = useSharedValue(0);
  const lifted = useSharedValue(0);
  const dragging = useSharedValue(false);

  const pickedUp = useCallback(() => {
    onDragChange?.(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [onDragChange]);

  const putDown = useCallback(() => {
    onDragChange?.(false);
  }, [onDragChange]);

  // A tick per slot crossed, so the finger covering the event still feels
  // each quarter hour or date it passes.
  const slotChanged = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  const settle = useCallback(
    (commit: () => Promise<void>) => {
      settledX.value = dragX.value;
      settledY.value = dragY.value;
      dragX.value = 0;
      dragY.value = 0;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      void commit().finally(() => {
        settledX.value = 0;
        settledY.value = 0;
      });
    },
    [dragX, dragY, settledX, settledY],
  );

  const cancel = useCallback(() => {
    'worklet';
    dragX.value = withTiming(0, RETURN);
    dragY.value = withTiming(0, RETURN);
  }, [dragX, dragY]);

  const applyBlocking = useCallback(
    (gesture: GestureType, blocking?: (RefObject<unknown> | GestureType)[]) => {
      if (!blocking?.length) return;
      // Gesture Handler's own ref type still says `undefined` where React 19's
      // `useRef` says `null`; the values passed here are the refs and gestures
      // it documents. Removed when its types adopt React 19's shape.
      gesture.blocksExternalGesture(
        ...(blocking as Parameters<typeof gesture.blocksExternalGesture>),
      );
    },
    [],
  );

  const style = useAnimatedStyle<ViewStyle>(() => ({
    transform: [
      { translateX: dragX.value + settledX.value },
      { translateY: dragY.value + settledY.value },
      { scale: 1 + lifted.value * 0.03 },
    ],
    // Lift the event clear of its neighbours while it travels over them.
    zIndex: lifted.value > 0 ? 10 : 0,
    elevation: lifted.value * 8,
    shadowOpacity: lifted.value * 0.3,
    shadowRadius: lifted.value * 10,
    shadowOffset: { width: 0, height: lifted.value * 4 },
    opacity: 1 - lifted.value * 0.08,
  }));

  return {
    dragX,
    dragY,
    dragging,
    lifted,
    style,
    pickedUp,
    putDown,
    slotChanged,
    settle,
    cancel,
    applyBlocking,
  };
}

export { LIFT };
