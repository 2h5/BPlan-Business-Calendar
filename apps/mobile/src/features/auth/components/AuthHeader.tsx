import { Text, useTheme } from '@cal/ui';
import { View } from 'react-native';

export interface AuthHeaderProps {
  /** Small accent line above the title. */
  eyebrow: string;
  title: string;
  subtitle: string;
}

/**
 * The web sign-in page's masthead: the brand lockup pinned to the leading edge,
 * then a centred eyebrow / title / subtitle stack above the form.
 */
export function AuthHeader({ eyebrow, title, subtitle }: AuthHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xxxl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="subhead" color="onAccent" style={{ fontWeight: '700' }}>
            B
          </Text>
        </View>
        <Text variant="headline">BCal</Text>
      </View>

      <View style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
        <Text variant="caption" color="accent" uppercase>
          {eyebrow}
        </Text>
        <Text variant="title1" align="center">
          {title}
        </Text>
        <Text variant="callout" color="secondary" align="center">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
