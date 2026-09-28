import { Text, useTheme, type IconName } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';

/** One button revealed behind a swiped task row. */
export function SwipeAction({
  icon,
  label,
  background,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  background: string;
  tint: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 76,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xxs,
        backgroundColor: background,
      }}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text variant="caption" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}
