import { View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string | number;
  tone?: BadgeTone;
  style?: ViewStyle;
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();

  // Web `.badge`: a subtle tinted pill outlined in its own tone.
  const palette: Record<BadgeTone, { bg: string; fg: string; border: string }> = {
    neutral: {
      bg: theme.colors.surfaceElevated,
      fg: theme.colors.textSecondary,
      border: theme.colors.border,
    },
    accent: {
      bg: theme.colors.accentSubtle,
      fg: theme.colors.accent,
      border: theme.colors.accentSubtle,
    },
    success: {
      bg: theme.colors.successSubtle,
      fg: theme.colors.success,
      border: theme.colors.successSubtle,
    },
    warning: {
      bg: theme.colors.warningSubtle,
      fg: theme.colors.warning,
      border: theme.colors.warningSubtle,
    },
    danger: {
      bg: theme.colors.dangerSubtle,
      fg: theme.colors.danger,
      border: theme.colors.dangerSubtle,
    },
  };

  return (
    <View
      style={[
        {
          minWidth: 22,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 3,
          borderRadius: theme.radius.pill,
          borderWidth: theme.borderWidth.hairline,
          borderColor: palette[tone].border,
          backgroundColor: palette[tone].bg,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text variant="caption" uppercase style={{ color: palette[tone].fg }}>
        {String(label)}
      </Text>
    </View>
  );
}
