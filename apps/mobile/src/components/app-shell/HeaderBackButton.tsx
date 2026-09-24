import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

export interface HeaderBackButtonProps {
  label: string;
}

/**
 * Stands in for the native back button on root-stack screens pushed over
 * `(tabs)`. On iOS 26, react-native-screens 4.16 leaves the native button
 * dead from the second push onward when the screen below has no header
 * (software-mansion/react-native-screens#3294); swipe-back still works.
 * Remove once Expo's pinned react-native-screens ships the fix.
 */
export function HeaderBackButton({ label }: HeaderBackButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => router.back()}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 }}
    >
      <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
      <Text style={{ ...theme.typography.body, color: theme.colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}
