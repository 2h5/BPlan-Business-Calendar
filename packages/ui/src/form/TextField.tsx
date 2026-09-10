import { forwardRef, useState, type ReactNode } from 'react';
import { TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Validation message. Its presence puts the field in the error state. */
  error?: string;
  /** Guidance shown when there is no error. */
  hint?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerStyle?: ViewStyle;
}

/** Width of the web's `box-shadow: 0 0 0 3px var(--color-focus-ring)` on focus. */
const FOCUS_RING_WIDTH = 3;

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, leading, trailing, containerStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label ? (
        <Text variant="subhead" color="secondary">
          {label}
        </Text>
      ) : null}

      {/* The ring is drawn as an outer inset rather than a shadow so it renders
          identically on both platforms — RN has no `outline`. */}
      <View
        style={{
          padding: FOCUS_RING_WIDTH,
          margin: -FOCUS_RING_WIDTH,
          borderRadius: theme.radius.md + FOCUS_RING_WIDTH,
          backgroundColor: focused
            ? error
              ? theme.colors.dangerSubtle
              : theme.colors.focusRing
            : 'transparent',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            // The web control is 40pt; a touch target is not allowed below 44.
            minHeight: theme.hitSlopSize,
            paddingHorizontal: theme.spacing.md,
            borderRadius: theme.radius.md,
            borderWidth: theme.borderWidth.hairline,
            borderColor,
            backgroundColor: theme.colors.inputBackground,
          }}
        >
          {leading}
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            placeholderTextColor={theme.colors.textTertiary}
            selectionColor={theme.colors.accent}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            style={[
              theme.typography.callout,
              { flex: 1, color: theme.colors.textPrimary, paddingVertical: theme.spacing.sm },
            ]}
            {...rest}
          />
          {trailing}
        </View>
      </View>

      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
