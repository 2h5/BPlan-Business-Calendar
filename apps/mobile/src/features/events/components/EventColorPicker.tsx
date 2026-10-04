import { Chip, Text, useTheme } from '@cal/ui';
import { Pressable, View } from 'react-native';

import { eventColorSwatches } from '../utils/event-form';

export interface EventColorPickerProps {
  /** NULL inherits the calendar's colour. */
  value: string | null;
  /** The selected calendar's colour, shown on the Inherit chip. */
  inheritedColor: string | undefined;
  onChange: (color: string | null) => void;
}

export function EventColorPicker({ value, inheritedColor, onChange }: EventColorPickerProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="secondary">
        Color
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {/* "Inherit" is the default rather than a colour of its own, so the
            event keeps following its calendar unless asked not to. */}
        <Chip
          label="Inherit"
          color={inheritedColor}
          selected={value === null}
          onPress={() => onChange(null)}
        />

        {eventColorSwatches(value).map((option) => {
          const isSelected = value === option.value;
          // Read into a local: Reanimated's dev Babel plugin flags any
          // `x.value` inside an inline style as a shared-value misuse, and
          // `option.value` here is only a hex string.
          const swatch = option.value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onChange(swatch)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: swatch,
                // The ring is drawn inside a same-coloured halo so selection
                // reads without the swatch changing size and reflowing.
                borderWidth: theme.borderWidth.thick,
                borderColor: isSelected ? theme.colors.textPrimary : 'transparent',
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
