import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { canUseGlassEffect } from '../../../lib/glass';

const SEND_SIZE = 30;

export interface FindTimePillProps {
  /** The middle of the pill: placeholder copy when folded, the text field when open. */
  children: ReactNode;
  /** The trailing send control. */
  trailing: ReactNode;
  /** Flat-fallback pressed state; native glass draws its own. */
  pressed?: boolean;
}

/**
 * The one shape Find Time takes, folded or open: a liquid-glass capsule with
 * the sparkle on the left and the send arrow on the right. Sharing it is what
 * keeps the bar from jumping or restyling the moment it is tapped.
 */
export function FindTimePill({ children, trailing, pressed = false }: FindTimePillProps) {
  const theme = useTheme();
  const supportsGlass = canUseGlassEffect();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        height: theme.hitSlopSize,
        paddingLeft: theme.spacing.md,
        paddingRight: theme.spacing.sm,
      }}
    >
      {supportsGlass ? (
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.pill }]}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: theme.radius.pill,
              borderWidth: theme.borderWidth.hairline,
              borderColor: theme.colors.border,
              backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceRaised,
            },
          ]}
        />
      )}

      <Ionicons name="sparkles" size={16} color={theme.colors.focusAccent} />
      <View style={{ flex: 1, alignSelf: 'stretch', justifyContent: 'center' }}>{children}</View>
      {trailing}
    </View>
  );
}

export interface FindTimeSendButtonProps {
  /** Lights the arrow up; off, it reads exactly like the folded bar's arrow. */
  enabled: boolean;
  pending?: boolean;
  /** Omit for a decorative arrow, as on the folded bar. */
  onPress?: () => void;
}

export function FindTimeSendButton({ enabled, pending = false, onPress }: FindTimeSendButtonProps) {
  const theme = useTheme();
  const lit = enabled || pending;

  const circle = (
    <View
      style={{
        width: SEND_SIZE,
        height: SEND_SIZE,
        borderRadius: theme.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: lit ? theme.colors.accent : 'transparent',
      }}
    >
      {pending ? (
        <ActivityIndicator size="small" color={theme.colors.onAccent} />
      ) : (
        <Ionicons
          name="arrow-up"
          size={16}
          color={lit ? theme.colors.onAccent : theme.colors.textTertiary}
        />
      )}
    </View>
  );

  if (!onPress) return circle;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Find time"
      accessibilityState={{ disabled: !enabled, busy: pending }}
      disabled={!enabled}
      hitSlop={theme.spacing.sm}
      onPress={onPress}
      style={({ pressed }) => ({
        transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
      })}
    >
      {circle}
    </Pressable>
  );
}
