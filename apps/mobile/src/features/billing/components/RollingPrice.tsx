import { Text, useTheme, type TextProps } from '@cal/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export interface RollingPriceProps {
  /** The price as shown, e.g. `$49.99`. */
  value: string;
  /** The same price as a number — its direction of travel decides the roll. */
  amount: number;
  variant?: TextProps['variant'];
}

/** Matches the web page's roll: 300ms on the same near-expo ease-out. */
const ROLL_MS = 300;
const ROLL_EASING = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * A price that rolls to its new value instead of being replaced: the old one
 * leaves through the top and the new one arrives from below when the price goes
 * up, and the other way around when it comes down. The direction carries
 * meaning here — it is the difference between a bigger number and a smaller one
 * — which a crossfade would throw away.
 *
 * The two prices live in two fixed slots that swap roles, rather than one being
 * mounted for the length of the roll. Mounting is what a React commit controls
 * and the animation is what the UI thread controls, and those two do not land
 * on the same frame: a slot created and destroyed around the roll left a blank
 * frame at the start of it (measured on the simulator), and tearing an animated
 * node down as its animation ends also drew a complaint from the native
 * animation module. With both slots always mounted, the worst a late frame can
 * do is hold the old price one frame longer.
 */
export function RollingPrice({ value, amount, variant = 'title1' }: RollingPriceProps) {
  const reduceMotion = useReducedMotion();
  const theme = useTheme();
  const typography = theme.typography[variant];
  /** The roll travels exactly one line, so a price never half-shows. */
  const lineHeight = typography.lineHeight ?? 0;

  /** The price on screen, and which of the two slots is holding it. */
  const [shown, setShown] = useState({ value, amount, slot: 0 });
  /** Whatever the other slot still holds — the price on its way out. */
  const [vacating, setVacating] = useState('');

  /** The slot the current price is arriving in. */
  const arriving = useSharedValue(0);
  /** 1 when the price rose, -1 when it fell. */
  const direction = useSharedValue(1);
  /** 0 as a roll starts, 1 once the new price has settled. */
  const progress = useSharedValue(1);

  useEffect(() => {
    if (amount === shown.amount) return;

    const slot = shown.slot === 0 ? 1 : 0;
    direction.value = amount > shown.amount ? 1 : -1;
    arriving.value = slot;
    setVacating(shown.value);
    setShown({ value, amount, slot });

    // Reduce Motion asked for the number, not the theatre.
    if (reduceMotion) {
      progress.value = 1;
      return;
    }

    progress.value = 0;
    progress.value = withTiming(1, { duration: ROLL_MS, easing: ROLL_EASING });
  }, [value, amount, shown, reduceMotion, arriving, direction, progress]);

  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      {/* Both moving copies are positioned, so the box would otherwise have no
          width of its own. This one is laid out and invisible, and it is the
          current price so the copy beside it — the `/ month` — sits where the
          settled price leaves it. */}
      <Text
        variant={variant}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ opacity: 0 }}
      >
        {shown.value}
      </Text>

      {[0, 1].map((slot) => (
        <PriceSlot
          key={slot}
          slot={slot}
          arriving={arriving}
          direction={direction}
          progress={progress}
          lineHeight={lineHeight}
          typography={typography}
          // The slot that is leaving is a departing copy of a price the screen
          // has already announced.
          hiddenFromAccessibility={shown.slot !== slot}
        >
          {shown.slot === slot ? shown.value : vacating}
        </PriceSlot>
      ))}
    </View>
  );
}

/**
 * One of the two prices. Whichever slot is arriving travels in from the
 * direction the price is moving and the other leaves the opposite way, so the
 * pair always moves as one column.
 *
 * Written against `Animated.Text` with the typography token applied by hand:
 * the shared `Text` cannot be wrapped by `createAnimatedComponent`, which needs
 * a forwarded ref to the underlying node.
 */
function PriceSlot({
  slot,
  arriving,
  direction,
  progress,
  lineHeight,
  typography,
  hiddenFromAccessibility,
  children,
}: {
  slot: number;
  arriving: SharedValue<number>;
  direction: SharedValue<number>;
  progress: SharedValue<number>;
  lineHeight: number;
  typography: TextProps['style'];
  hiddenFromAccessibility: boolean;
  children: string;
}) {
  const theme = useTheme();

  const rollStyle = useAnimatedStyle(() => {
    const isArriving = arriving.value === slot;
    const travelled = isArriving ? 1 - progress.value : -progress.value;

    return {
      opacity: isArriving ? progress.value : 1 - progress.value,
      transform: [{ translateY: travelled * direction.value * lineHeight }],
    };
  });

  return (
    <Animated.Text
      numberOfLines={1}
      accessibilityElementsHidden={hiddenFromAccessibility}
      importantForAccessibility={hiddenFromAccessibility ? 'no-hide-descendants' : 'auto'}
      style={[
        typography,
        { position: 'absolute', left: 0, top: 0, color: theme.colors.textPrimary },
        rollStyle,
      ]}
    >
      {children}
    </Animated.Text>
  );
}
