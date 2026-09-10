import { Card, Text, useTheme, type IconName } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';

import { useAppearance } from '../appearance/AppearanceProvider';
import {
  THEME_MODES,
  THEME_MODE_DESCRIPTION,
  THEME_MODE_LABEL,
  type ThemeMode,
} from '../appearance/theme-mode';

const ICON: Record<ThemeMode, IconName> = {
  auto: 'phone-portrait-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
};

/**
 * The web's Appearance section: three preview tiles, the active one outlined
 * and check-marked, and a line underneath saying what is actually on screen —
 * which is the part that matters when the choice is "System default".
 */
export function AppearanceCard() {
  const theme = useTheme();
  const { mode, scheme, setMode } = useAppearance();

  const select = (next: ThemeMode) => {
    if (next === mode) return;
    void Haptics.selectionAsync();
    setMode(next);
  };

  return (
    <Card
      eyebrow="Appearance"
      description="Customize how BCal looks on this device."
      padded={false}
    >
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          {THEME_MODES.map((option) => (
            <ThemeTile
              key={option}
              option={option}
              selected={option === mode}
              onPress={() => select(option)}
            />
          ))}
        </View>

        <Text variant="footnote" color="secondary">
          Currently active:{' '}
          <Text variant="footnote" color="primary">
            {scheme === 'dark' ? 'Dark' : 'Light'} theme
          </Text>
          {mode === 'auto' ? ' (synchronized with system)' : ''}
        </Text>
      </View>
    </Card>
  );
}

interface ThemeTileProps {
  option: ThemeMode;
  selected: boolean;
  onPress: () => void;
}

function ThemeTile({ option, selected, onPress }: ThemeTileProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={THEME_MODE_LABEL[option]}
      accessibilityHint={THEME_MODE_DESCRIPTION[option]}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radius.md,
        borderWidth: theme.borderWidth.hairline,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected
          ? theme.colors.accentSubtle
          : pressed
            ? theme.colors.hover
            : theme.colors.surfaceRaised,
      })}
    >
      <View>
        <ThemePreview option={option} />
        {/* On the preview rather than beside the label, so all three labels get
            the full tile width and wrap the same way. */}
        {selected ? (
          <View
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Ionicons name="checkmark-circle" size={18} color={theme.colors.accent} />
          </View>
        ) : null}
      </View>

      <Text
        variant="footnote"
        numberOfLines={2}
        style={{
          color: selected ? theme.colors.accent : theme.colors.textSecondary,
          fontWeight: '600',
        }}
      >
        {THEME_MODE_LABEL[option]}
      </Text>
    </Pressable>
  );
}

/**
 * A miniature of the thing being chosen, painted in that theme's own colours
 * rather than the current one — the point of the tile is to show what you get.
 */
function ThemePreview({ option }: { option: ThemeMode }) {
  const theme = useTheme();

  const swatch =
    option === 'light'
      ? { bg: '#FFFFFF', line: '#D9DDE5', icon: '#4766DB' }
      : option === 'dark'
        ? { bg: '#13171E', line: '#29313E', icon: '#8AA4FF' }
        : {
            bg: theme.colors.surfaceElevated,
            line: theme.colors.border,
            icon: theme.colors.accent,
          };

  return (
    <View
      style={{
        height: 52,
        borderRadius: theme.radius.sm,
        borderWidth: theme.borderWidth.hairline,
        borderColor: swatch.line,
        backgroundColor: swatch.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={ICON[option]} size={20} color={swatch.icon} />
    </View>
  );
}
