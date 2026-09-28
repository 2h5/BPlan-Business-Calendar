import { Text, useTheme } from '@cal/ui';
import { Link, type Href } from 'expo-router';
import { View } from 'react-native';

export interface AuthSwitchLinkProps {
  prompt: string;
  action: string;
  href: Href;
}

/** "Don't have an account? Create an account" beneath the auth form. */
export function AuthSwitchLink({ prompt, action, href }: AuthSwitchLinkProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
      }}
    >
      <Text variant="subhead" color="secondary" style={{ fontWeight: '400' }}>
        {prompt}
      </Text>
      <Link href={href} replace>
        <Text variant="subhead" color="accent" style={{ fontWeight: '600' }}>
          {action}
        </Text>
      </Link>
    </View>
  );
}
