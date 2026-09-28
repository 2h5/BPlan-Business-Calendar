import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

/** The muted leading glyph inside a sign-in field. */
export function FieldIcon({ name }: { name: ComponentProps<typeof Ionicons>['name'] }) {
  const theme = useTheme();
  return <Ionicons name={name} size={20} color={theme.colors.textTertiary} />;
}
