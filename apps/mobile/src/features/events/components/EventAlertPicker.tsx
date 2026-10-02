import { Chip, Text, useTheme } from '@cal/ui';
import { View } from 'react-native';

import { alertOptions, toggleAlert } from '../utils/event-alerts';

export interface EventAlertPickerProps {
  /** Minutes before the start, ascending. */
  value: number[];
  onChange: (alerts: number[]) => void;
}

export function EventAlertPicker({ value, onChange }: EventAlertPickerProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="secondary">
        Alert
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {alertOptions(value).map((option) => (
          <Chip
            key={option.minutes}
            label={option.label}
            selected={value.includes(option.minutes)}
            onPress={() => onChange(toggleAlert(value, option.minutes))}
          />
        ))}
      </View>
    </View>
  );
}
