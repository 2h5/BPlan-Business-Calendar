import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * `md` is the web's `--control-height` (40) raised to the 44pt minimum a touch
 * target has to clear; `sm` is `--control-height-sm`.
 */
const HEIGHT: Record<ButtonSize, number> = { sm: 34, md: 44, lg: 52 };

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(1 - pressed.value * (1 - theme.motion.pressScale), theme.motion.spring) },
    ],
  }));

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.accent },
    secondary: {
      backgroundColor: theme.colors.surfaceRaised,
      borderWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.border,
    },
    ghost: { backgroundColor: 'transparent' },
    destructive: {
      backgroundColor: theme.colors.dangerSubtle,
      borderWidth: theme.borderWidth.hairline,
      borderColor: theme.colors.dangerSubtle,
    },
  };

  const labelColor = {
    primary: 'onAccent',
    secondary: 'primary',
    ghost: 'accent',
    destructive: 'danger',
  } as const;

  const isInactive = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isInactive, busy: loading }}
      disabled={isInactive}
      onPressIn={() => {
        pressed.value = 1;
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      style={[
        styles.base,
        surface[variant],
        {
          height: HEIGHT[size],
          borderRadius: theme.radius.md,
          paddingHorizontal: size === 'sm' ? theme.spacing.md : theme.spacing.lg,
          gap: theme.spacing.sm,
          opacity: isInactive ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        animatedStyle,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.colors.onAccent : theme.colors.accent}
        />
      ) : (
        <>
          {leadingIcon ? <View>{leadingIcon}</View> : null}
          <Text variant={size === 'sm' ? 'subhead' : 'headline'} color={labelColor[variant]}>
            {label}
          </Text>
          {trailingIcon ? <View>{trailingIcon}</View> : null}
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
