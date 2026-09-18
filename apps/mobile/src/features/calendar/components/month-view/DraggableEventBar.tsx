import { resolveEventColor } from '@cal/domain';
import { Text, useTheme } from '@cal/ui';
import { useCallback, useState, type RefObject } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { LIFT, PICK_UP_MS, useDragLift } from '../../hooks/useDragLift';
import { withAlpha } from '../../utils/color';

/** Titles on the bars — below caption size, so more of each title fits. */
const BAR_FONT_SIZE = 10;

export interface EventDayMove {
  occurrence: EventOccurrence;
  /** Whole local days to shift the event by, keeping its time of day. */
  dayDelta: number;
}

export interface DraggableEventBarProps {
  occurrence: EventOccurrence;
  /** Where the bar sits in its week row, in pixels and percentages. */
  layout: { top: number; height: number; left: string; width: string };
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Which of the six week rows this bar is in, and where it starts in that row. */
  weekIndex: number;
  weekCount: number;
  startColumn: number;
  columnCount: number;
  /** One day cell, for snapping the drag to whole dates. */
  columnWidth: number;
  rowHeight: number;
  /** False when the event cannot be re-dated — it then behaves as a plain bar. */
  movable: boolean;
  /** What must stand down once a drag starts, such as the month pager. */
  blocking?: (RefObject<unknown> | GestureType)[];
  /** How a target `dayDelta` reads as a date, for the badge under the finger. */
  formatTarget: (dayDelta: number) => string;
  onPress: () => void;
  /** Resolves once the move has settled, successfully or not. */
  onMove: (move: EventDayMove) => Promise<void>;
  /** Told when this bar is picked up and put down, so its week row can be raised. */
  onDragChange?: (dragging: boolean) => void;
}

/**
 * An event bar in the month grid that can be picked up and dropped on another
 * date.
 *
 * The month grid has no hours, so a drag here means only one thing: which day
 * the event sits on. Travel snaps to whole cells in both directions and the
 * two combine — a cell right is one day, a row down is seven — so dragging
 * diagonally across the grid moves the event the number of days actually
 * between those two dates.
 *
 * The event keeps its time of day. Nothing about a month cell says when in the
 * day something happens, so a drag that silently re-timed a 9am meeting would
 * be changing something the user cannot see.
 */
export function DraggableEventBar({
  occurrence,
  layout,
  continuesBefore,
  continuesAfter,
  weekIndex,
  weekCount,
  startColumn,
  columnCount,
  columnWidth,
  rowHeight,
  movable,
  blocking,
  formatTarget,
  onPress,
  onMove,
  onDragChange,
}: DraggableEventBarProps) {
  const theme = useTheme();
  const lift = useDragLift(onDragChange);
  const { dragX, dragY, dragging, lifted } = lift;

  const targetDayDelta = useSharedValue(0);
  const [preview, setPreview] = useState<number | null>(null);

  // The grid is six weeks of seven days and nothing beyond it is drawn, so a
  // drag is held inside it rather than allowed to point at a cell that is not
  // there. Reaching a further month is the swipe's job.
  const minColumnDelta = -startColumn;
  const maxColumnDelta = columnCount - 1 - startColumn;
  const minWeekDelta = -weekIndex;
  const maxWeekDelta = weekCount - 1 - weekIndex;

  const color = resolveEventColor(
    occurrence.event.color,
    occurrence.calendar?.color,
    theme.colors.accent,
  );
  const cancelled = occurrence.event.status === 'cancelled';

  const commit = useCallback(
    (dayDelta: number) => {
      setPreview(null);
      return onMove({ occurrence, dayDelta });
    },
    [occurrence, onMove],
  );

  const drop = useCallback(
    (dayDelta: number) => {
      lift.settle(() => commit(dayDelta));
    },
    [lift, commit],
  );

  const clearPreview = useCallback(() => setPreview(null), []);

  const drag = Gesture.Pan()
    .enabled(movable)
    .activateAfterLongPress(PICK_UP_MS)
    .onStart(() => {
      dragging.value = true;
      lifted.value = withSpring(1, LIFT);
      runOnJS(lift.pickedUp)();
    })
    .onUpdate((event) => {
      const rawColumns = columnWidth > 0 ? Math.round(event.translationX / columnWidth) : 0;
      const rawWeeks = rowHeight > 0 ? Math.round(event.translationY / rowHeight) : 0;
      const columns = Math.max(minColumnDelta, Math.min(maxColumnDelta, rawColumns));
      const weeks = Math.max(minWeekDelta, Math.min(maxWeekDelta, rawWeeks));

      dragX.value = columns * columnWidth;
      dragY.value = weeks * rowHeight;
      targetDayDelta.value = weeks * columnCount + columns;
    })
    .onEnd(() => {
      const days = targetDayDelta.value;
      if (days === 0) {
        lift.cancel();
        runOnJS(clearPreview)();
        return;
      }
      runOnJS(drop)(days);
    })
    .onFinalize(() => {
      dragging.value = false;
      lifted.value = withSpring(0, LIFT);
      runOnJS(lift.putDown)();
    });

  lift.applyBlocking(drag, blocking);

  useAnimatedReaction(
    () => ({ dragging: dragging.value, dayDelta: targetDayDelta.value }),
    (next, previous) => {
      if (!next.dragging) return;
      if (previous?.dragging === true && next.dayDelta === previous.dayDelta) return;
      runOnJS(setPreview)(next.dayDelta);
    },
  );

  const startRadius = continuesBefore ? 0 : theme.radius.sm;
  const endRadius = continuesAfter ? 0 : theme.radius.sm;

  const barStyle = (pressed: boolean): ViewStyle => ({
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginHorizontal: 1,
    borderTopLeftRadius: startRadius,
    borderBottomLeftRadius: startRadius,
    borderTopRightRadius: endRadius,
    borderBottomRightRadius: endRadius,
    backgroundColor: pressed ? theme.colors.surfacePressed : withAlpha(color, 0.22),
    opacity: cancelled ? 0.5 : 1,
  });

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={occurrence.event.title}
          onPress={onPress}
          style={({ pressed }) => barStyle(pressed)}
        >
          {/* The leading cap is the same colour signal the timeline chips use —
              omitted when the bar is a continuation. */}
          {!continuesBefore ? (
            <View style={{ width: 2, alignSelf: 'stretch', backgroundColor: color }} />
          ) : null}

          <Text
            variant="caption"
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: BAR_FONT_SIZE,
              lineHeight: BAR_FONT_SIZE + 2,
              fontWeight: '500',
              letterSpacing: 0,
              paddingLeft: 3,
              paddingRight: 1,
              color: theme.colors.textPrimary,
              textDecorationLine: cancelled ? 'line-through' : 'none',
            }}
          >
            {occurrence.event.title}
          </Text>
        </Pressable>

        {preview !== null ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -theme.spacing.md,
              left: 0,
              paddingHorizontal: theme.spacing.xs,
              paddingVertical: 1,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text variant="caption" style={{ color: theme.colors.onAccent }}>
              {formatTarget(preview)}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
