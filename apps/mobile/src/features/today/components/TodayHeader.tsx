import { Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

export interface TodayHeaderProps {
  /** "Wednesday, September 23". */
  dateLabel: string;
  /** "Good morning, Dev". */
  greeting: string;
  /** A sun between 5am and 5pm local time, a moon otherwise. */
  isDaytime: boolean;
  onSearch: () => void;
}

/**
 * A large "Today" title with the date and greeting beneath it. Adding lives
 * in the floating "+" rather than here, so the header stays quiet; search is
 * the one control, drawn as a translucent round button in the iOS 26 manner.
 */
export function TodayHeader({ dateLabel, greeting, isDaytime, onSearch }: TodayHeaderProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="display" accessibilityRole="header">
            Today
          </Text>
          <Ionicons
            name={isDaytime ? 'sunny' : 'moon'}
            size={isDaytime ? 26 : 22}
            color={theme.colors.warning}
            accessibilityLabel={isDaytime ? 'Daytime' : 'Nighttime'}
          />
        </View>
        <Text variant="footnote" color="secondary" numberOfLines={1}>
          {`${dateLabel} · ${greeting}`}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search events and tasks"
        onPress={onSearch}
        hitSlop={theme.spacing.xs}
        style={({ pressed }) => ({
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: theme.borderWidth.hairline,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceRaised,
        })}
      >
        <Ionicons name="search" size={18} color={theme.colors.textPrimary} />
      </Pressable>
    </View>
  );
}
