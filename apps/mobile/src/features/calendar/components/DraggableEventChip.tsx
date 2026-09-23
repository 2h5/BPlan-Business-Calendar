import {
  dateKeyMinuteToInstant,
  formatTimeOfDay,
  MINUTES_PER_DAY,
  MOVE_SNAP_MINUTES,
} from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { useCallback, useState, type RefObject } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { EventChip } from './EventChip';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { LIFT, PICK_UP_MS, useDragLift } from '../hooks/useDragLift';
import { dateKeyToInstant, shiftDateKey } from '../utils/window';

export interface EventMove {
  occurrence: EventOccurrence;
  /** Local date key the event is dropped on. */
  dateKey: string;
  startMinute: number;
  endMinute: number;
}

export interface DraggableEventChipProps {
  occurrence: EventOccurrence;
  /** The day column this chip is drawn in. */
  dateKey: string;
  timeZone: string;
  hourCycle: HourCycle;
  layout: { top: number; height: number; left: string; width: string };
  compact?: boolean;
  /** Drawn in a narrow week column; see `EventChip`. */
  narrow?: boolean;
  hourHeight: number;
  /** Width of one day column; 0 in a view with only one day, which pins the drag vertical. */
  columnWidth: number;
  /** Where this column sits among the days on screen, and how many there are. */
  columnIndex: number;
  columnCount: number;
  /** False when the event cannot be re-timed — it then behaves as a plain chip. */
  movable: boolean;
  /**
   * What must stand down once a drag starts: the vertical scroll and the pager.
   * Either a gesture or a ref to a gesture-handling component.
   */
  blocking?: (RefObject<unknown> | GestureType)[];
  onPress: () => void;
  /** Resolves once the move has settled, successfully or not. */
  onMove: (move: EventMove) => Promise<void>;
  /** Told when this chip is picked up and put down, so its column can be raised. */
  onDragChange?: (dragging: boolean) => void;
}

/**
 * An event chip on an hour grid that can be picked up and dropped at another
 * time, and — where the view shows more than one day — another day.
 *
 * The gesture is a pan that only activates after a press is held, which is
 * what keeps all three interactions on the same chip distinct: a tap opens the
 * event, a drag that starts straight away scrolls or turns the page, and only
 * a deliberate hold moves the event. Picking one up is confirmed by a haptic,
 * because the chip must be under a finger to be dragged and is therefore
 * partly hidden by it.
 *
 * The chip previews where it will land rather than following the finger
 * exactly: vertical travel snaps to the quarter hour and horizontal travel to
 * whole day columns, so the drop holds no surprise.
 */
export function DraggableEventChip({
  occurrence,
  dateKey,
  timeZone,
  hourCycle,
  layout,
  compact,
  narrow,
  hourHeight,
  columnWidth,
  columnIndex,
  columnCount,
  movable,
  blocking,
  onPress,
  onMove,
  onDragChange,
}: DraggableEventChipProps) {
  const theme = useTheme();
  const lift = useDragLift(onDragChange);
  const { dragX, dragY, dragging, lifted, pickedUp, putDown, slotChanged, cancel } = lift;

  const startMinute = Math.round(
    (occurrence.start - dateKeyToInstant(dateKey, timeZone).getTime()) / 60_000,
  );
  const durationMinutes = Math.round((occurrence.end - occurrence.start) / 60_000);

  // The snapped drop target, kept on the UI thread for the gesture to read at
  // release and mirrored to JS only when it changes — so the time readout
  // re-renders once per quarter hour crossed rather than once per frame.
  const targetDayDelta = useSharedValue(0);
  const targetStartMinute = useSharedValue(startMinute);
  const [preview, setPreview] = useState<{ dayDelta: number; startMinute: number } | null>(null);

  const earliestStart = -startMinute;
  const latestStart = MINUTES_PER_DAY - durationMinutes - startMinute;
  const minDayDelta = -columnIndex;
  const maxDayDelta = columnCount - 1 - columnIndex;

  const commit = useCallback(
    (dayDelta: number, deltaMinutes: number) => {
      const targetKey = dayDelta === 0 ? dateKey : shiftDateKey(dateKey, dayDelta, timeZone);
      const nextStart = startMinute + deltaMinutes;

      setPreview(null);
      return onMove({
        occurrence,
        dateKey: targetKey,
        startMinute: nextStart,
        endMinute: nextStart + durationMinutes,
      });
    },
    [dateKey, timeZone, startMinute, durationMinutes, occurrence, onMove],
  );

  const drop = useCallback(
    (dayDelta: number, deltaMinutes: number) => {
      lift.settle(() => commit(dayDelta, deltaMinutes));
    },
    [lift, commit],
  );

  const clearPreview = useCallback(() => setPreview(null), []);

  const drag = Gesture.Pan()
    .enabled(movable)
    // Nothing moves until the chip has been held: a straight swipe belongs to
    // the scroll and the pager, which is why they are only blocked from here.
    .activateAfterLongPress(PICK_UP_MS)
    .onStart(() => {
      dragging.value = true;
      lifted.value = withSpring(1, LIFT);
      runOnJS(pickedUp)();
    })
    .onUpdate((event) => {
      const rawMinutes = (event.translationY / hourHeight) * 60;
      const snapped = Math.round(rawMinutes / MOVE_SNAP_MINUTES) * MOVE_SNAP_MINUTES;
      const clamped = Math.max(earliestStart, Math.min(latestStart, snapped));

      const rawDays = columnWidth > 0 ? Math.round(event.translationX / columnWidth) : 0;
      const days = Math.max(minDayDelta, Math.min(maxDayDelta, rawDays));

      dragY.value = (clamped / 60) * hourHeight;
      dragX.value = days * columnWidth;
      targetDayDelta.value = days;
      targetStartMinute.value = startMinute + clamped;
    })
    .onEnd(() => {
      const deltaMinutes = targetStartMinute.value - startMinute;
      const days = targetDayDelta.value;

      if (deltaMinutes === 0 && days === 0) {
        cancel();
        runOnJS(clearPreview)();
        return;
      }

      runOnJS(drop)(days, deltaMinutes);
    })
    .onFinalize(() => {
      dragging.value = false;
      lifted.value = withSpring(0, LIFT);
      runOnJS(putDown)();
    });

  lift.applyBlocking(drag, blocking);

  useAnimatedReaction(
    () => ({
      dragging: dragging.value,
      dayDelta: targetDayDelta.value,
      startMinute: targetStartMinute.value,
    }),
    (next, previous) => {
      if (!next.dragging) return;
      if (
        previous?.dragging === true &&
        next.dayDelta === previous.dayDelta &&
        next.startMinute === previous.startMinute
      ) {
        return;
      }
      runOnJS(setPreview)({ dayDelta: next.dayDelta, startMinute: next.startMinute });
      // The first report is the pick-up itself, which already has its haptic.
      if (previous?.dragging === true) runOnJS(slotChanged)();
    },
  );

  const previewInstant =
    preview &&
    dateKeyMinuteToInstant(
      preview.dayDelta === 0 ? dateKey : shiftDateKey(dateKey, preview.dayDelta, timeZone),
      preview.startMinute,
      timeZone,
    );

  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: layout.top,
            height: layout.height,
            left: layout.left as unknown as number,
            width: layout.width as unknown as number,
            shadowColor: '#000',
          },
          lift.style,
        ]}
      >
        <EventChip
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle={hourCycle}
          compact={compact}
          narrow={narrow}
          onPress={onPress}
          layout={{ top: 0, height: layout.height, left: '0%', width: '100%' }}
        />

        {previewInstant ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -theme.spacing.lg,
              left: 0,
              paddingHorizontal: theme.spacing.xs,
              paddingVertical: 1,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text variant="caption" style={{ color: theme.colors.onAccent }}>
              {formatTimeOfDay(previewInstant, timeZone, hourCycle)}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
