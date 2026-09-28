import { Text, useTheme } from '@cal/ui';
import { Text as RNText, View } from 'react-native';

import { BrandLogo } from './BrandLogo';
import { APP_NAME } from '../../../lib/brand';

export interface AuthHeaderProps {
  /** Small, widely tracked accent line above the title. */
  eyebrow: string;
  title: string;
  /** Trailing words of the title, drawn in the accent colour. */
  titleAccent?: string;
  subtitle: string;
}

/**
 * The sign-in masthead: the brand lockup centred above an eyebrow, a bold
 * headline with its last word in blue, and a line of context.
 */
export function AuthHeader({ eyebrow, title, titleAccent, subtitle }: AuthHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.xxxl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <BrandLogo size={34} />
        <Text variant="title2" style={{ fontWeight: '700', letterSpacing: -0.6 }}>
          {APP_NAME}
        </Text>
      </View>

      <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="caption" color="accent" uppercase style={{ letterSpacing: 2.4 }}>
          {eyebrow}
        </Text>
        <Text
          variant="display"
          align="center"
          accessibilityRole="header"
          style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -1.2 }}
        >
          {title}
          {titleAccent ? (
            <RNText style={{ color: theme.colors.accent }}>{` ${titleAccent}`}</RNText>
          ) : null}
        </Text>
        <Text
          variant="callout"
          color="secondary"
          align="center"
          style={{ fontSize: 17, lineHeight: 24, maxWidth: 300 }}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
