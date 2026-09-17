import { Text } from '@cal/ui';
import { Fragment } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  type EntryExitAnimationFunction,
  LayoutAnimationConfig,
  LinearTransition,
  type SharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/** How far a piece travels as it rolls — about one line of the title. */
const TRAVEL = 24;
const EXIT_MS = 120;
const ENTER_MS = 160;
/** The new text starts a beat after the old, so the two barely overlap. */
const ENTER_DELAY_MS = 20;
/**
 * A piece's slot eases to its new width over the roll, rather than snapping:
 * the outgoing text is not cut short mid-exit ("Septen…"), and what follows it
 * — the year after a month — slides across instead of jumping.
 */
const RESIZE = LinearTransition.duration(ENTER_MS).easing(Easing.out(Easing.cubic));

export interface CalendarHeadingProps {
  /**
   * The title in pieces that roll independently — `['August', '18']` in the
   * day view, `['September', '2026']` in the others — so only the piece that
   * changed moves. This is what makes a view switch cheap to read: day to week
   * turns the date into the year and leaves the month alone.
   */
  segments: readonly string[];
  /**
   * +1 after stepping later in time, -1 after stepping earlier: later rolls
   * down, earlier rolls up. A view switch sets it too, from the span the new
   * view covers — widening to week or month rolls down, narrowing back to day
   * rolls up — so the title moves the way the view opened out. It is a shared
   * value, set by whatever took the step, because the outgoing text's exit is
   * built from the props it last rendered with — which predate the step —
   * whereas a shared value is read at the moment the roll starts, so the
   * direction always matches what caused it.
   */
  direction: SharedValue<number>;
}

/**
 * The calendar screen's title, rolling like a ticker when it changes — whether
 * the change came from stepping through time or from switching view.
 *
 * Each piece is keyed on its own text, which is what turns a change into a
 * fresh mount — Reanimated then runs the exit on the old text and the entrance
 * on the new, while an unchanged piece keeps its key and stays still. Each
 * piece clips its own motion, so it reads as a roll within the title row
 * rather than text sliding over the controls beneath it. Both motions ease to
 * a stop: no overshoot.
 *
 * The caller must not key this component on the view mode. Doing so remounts
 * the whole heading on a switch, and a remount is exactly what the skipped
 * entering/exiting below suppresses — the title would swap with no motion at
 * all, which is the one case this component exists to avoid.
 */
export function CalendarHeading({ segments, direction }: CalendarHeadingProps) {
  // Later: the new text drops in from above as the old drops away below.
  // Earlier mirrors it, rolling up.
  const enter: EntryExitAnimationFunction = () => {
    'worklet';
    const ease = { duration: ENTER_MS, easing: Easing.out(Easing.cubic) };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: -direction.value * TRAVEL }] },
      animations: {
        opacity: withDelay(ENTER_DELAY_MS, withTiming(1, ease)),
        transform: [{ translateY: withDelay(ENTER_DELAY_MS, withTiming(0, ease)) }],
      },
    };
  };

  const exit: EntryExitAnimationFunction = () => {
    'worklet';
    const ease = { duration: EXIT_MS, easing: Easing.in(Easing.cubic) };
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: {
        opacity: withTiming(0, ease),
        transform: [{ translateY: withTiming(direction.value * TRAVEL, ease) }],
      },
    };
  };

  return (
    // No motion when the heading first appears or goes away — only on change.
    <LayoutAnimationConfig skipEntering skipExiting>
      <View style={{ flexDirection: 'row' }}>
        {segments.map((segment, index) => (
          <Fragment key={index}>
            {/* A fixed space, so spacing matches a single line of text. */}
            {index > 0 ? <Text variant="title3"> </Text> : null}
            <Animated.View style={{ overflow: 'hidden' }} layout={RESIZE}>
              <Animated.View key={segment} entering={enter} exiting={exit}>
                <Text variant="title3" numberOfLines={1}>
                  {segment}
                </Text>
              </Animated.View>
            </Animated.View>
          </Fragment>
        ))}
      </View>
    </LayoutAnimationConfig>
  );
}
