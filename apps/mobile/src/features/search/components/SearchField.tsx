import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  /** Runs the accent sweep along the bottom edge while a query is in flight. */
  isSearching: boolean;
}

const FIELD_HEIGHT = 56;
/** Fraction of the field the travelling sweep covers — the web's 40%. */
const SWEEP_FRACTION = 0.4;
const SWEEP_MS = 900;
/**
 * Slices standing in for the web's `linear-gradient` sweep; RN has no gradient
 * without a native module, so the band ramps up and down in steps.
 */
const SWEEP_SLICES = 9;

/** The Search page's hero field: the web `.searchBox`, focus ring and progress sweep included. */
export function SearchField({ value, onChangeText, isSearching }: SearchFieldProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [width, setWidth] = useState(0);

  return (
    <View
      style={{
        borderRadius: 18,
        padding: 4,
        margin: -4,
        backgroundColor: focused ? theme.colors.accentMuted : 'transparent',
      }}
    >
      <View
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        style={{
          height: FIELD_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingLeft: theme.spacing.lg,
          paddingRight: theme.spacing.sm,
          overflow: 'hidden',
          borderRadius: 14,
          borderWidth: theme.borderWidth.hairline,
          borderColor: focused ? theme.colors.borderStrong : theme.colors.borderSubtle,
          backgroundColor: focused ? theme.colors.surfaceElevated : theme.colors.surfaceRaised,
        }}
      >
        <Ionicons
          name="search"
          size={19}
          color={focused ? theme.colors.textPrimary : theme.colors.textTertiary}
        />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search your workspace"
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.accent}
          accessibilityLabel="Search workspace"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus
          clearButtonMode="never"
          returnKeyType="search"
          style={{
            flex: 1,
            height: '100%',
            color: theme.colors.textPrimary,
            fontSize: 17,
            letterSpacing: -0.17,
          }}
        />
        {value ? (
          <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}
              onPress={() => {
                onChangeText('');
                inputRef.current?.focus();
              }}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.pill,
                backgroundColor: pressed ? theme.colors.hover : 'transparent',
              })}
            >
              <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
            </Pressable>
          </Animated.View>
        ) : null}

        <ProgressSweep active={isSearching} width={width} />
      </View>
    </View>
  );
}

function ProgressSweep({ active, width }: { active: boolean; width: number }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const visible = useSharedValue(0);
  const band = width * SWEEP_FRACTION;

  useEffect(() => {
    visible.value = withTiming(active ? 1 : 0, { duration: 200 });
    if (!active || reduceMotion) return;
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
      -1,
    );
  }, [active, progress, reduceMotion, visible]);

  const style = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateX: -band + progress.value * (width + band) }],
  }));

  if (width === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, bottom: 0, height: 2, width: band, flexDirection: 'row' },
        style,
      ]}
    >
      {Array.from({ length: SWEEP_SLICES }, (_, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            backgroundColor: theme.colors.accent,
            opacity: Math.sin(((index + 0.5) / SWEEP_SLICES) * Math.PI),
          }}
        />
      ))}
    </Animated.View>
  );
}
