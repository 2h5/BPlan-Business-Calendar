import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface CardProps extends ViewProps {
  /** Small uppercase eyebrow above the card title. */
  eyebrow?: string;
  title?: string;
  /** Sits under the title, for a line of explanation. */
  description?: string;
  /** Rendered at the trailing edge of the header row. */
  headerAccessory?: ReactNode;
  padded?: boolean;
  elevated?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * The web's `.section`: a flat surface with a 1px edge, its header divided from
 * the body by a hairline rather than by whitespace. Depth comes from the border
 * and the surface colour, never from a shadow.
 */
export function Card({
  eyebrow,
  title,
  description,
  headerAccessory,
  padded = true,
  elevated = false,
  onPress,
  children,
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const surface: ViewStyle = {
    backgroundColor: elevated ? theme.colors.surfaceRaised : theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: theme.borderWidth.hairline,
    borderColor: theme.colors.borderSubtle,
    // Keeps a `padded={false}` list's row press states inside the rounded edge.
    overflow: 'hidden',
  };

  const hasHeader = Boolean(eyebrow || title || description || headerAccessory);

  const header = hasHeader ? (
    <View
      style={[
        styles.header,
        {
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.lg,
          borderBottomWidth: theme.borderWidth.hairline,
          borderBottomColor: theme.colors.borderSubtle,
        },
      ]}
    >
      <View style={styles.headerText}>
        {eyebrow ? (
          <Text variant="caption" color="tertiary" uppercase>
            {eyebrow}
          </Text>
        ) : null}
        {title ? <Text variant="headline">{title}</Text> : null}
        {description ? (
          <Text variant="footnote" color="secondary">
            {description}
          </Text>
        ) : null}
      </View>
      {headerAccessory}
    </View>
  ) : null;

  const content = (
    <>
      {header}
      <View style={padded ? { padding: theme.spacing.xl } : undefined}>{children}</View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          surface,
          pressed && { backgroundColor: theme.colors.surfacePressed },
          style,
        ]}
        {...rest}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[surface, style]} {...rest}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flexShrink: 1, gap: 2 },
});
