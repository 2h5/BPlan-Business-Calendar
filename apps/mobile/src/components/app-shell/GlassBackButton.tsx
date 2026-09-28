import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { canUseGlassEffect } from '../../lib/glass';

export interface GlassBackButtonProps {
  label?: string;
}

const HEIGHT = 44;

/**
 * A back button for screens that draw their own top bar. The glass capsule is
 * drawn here, sized by its own padding, so it always wraps the chevron and the
 * label — unlike the capsule UIKit draws around a `headerLeft` view, which is
 * sized before the label is measured and leaves the text crowding its edge.
 */
export function GlassBackButton({ label = 'Back' }: GlassBackButtonProps) {
  const theme = useTheme();
  const supportsGlass = canUseGlassEffect();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => router.back()}
      style={({ pressed }) => [
        styles.button,
        {
          height: HEIGHT,
          borderRadius: theme.radius.pill,
          transform: [{ scale: pressed ? theme.motion.pressScale : 1 }],
        },
      ]}
    >
      {supportsGlass ? (
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          style={[StyleSheet.absoluteFill, { borderRadius: theme.radius.pill }]}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: theme.radius.pill,
              borderWidth: theme.borderWidth.hairline,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
            },
          ]}
        />
      )}

      {/* The chevron glyph carries empty space on its left inside its em box;
          pulling it in keeps the content optically centred in the capsule. */}
      <Ionicons
        name="chevron-back"
        size={22}
        color={theme.colors.textPrimary}
        style={{ marginLeft: -4 }}
      />
      <Text style={{ ...theme.typography.body, color: theme.colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingLeft: 12,
    paddingRight: 16,
  },
});
