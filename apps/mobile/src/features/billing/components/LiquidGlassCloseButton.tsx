import { useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

export interface LiquidGlassCloseButtonProps {
  onPress: () => void;
}

function canUseGlassEffect(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    return isGlassEffectAPIAvailable();
  } catch {
    // Expo Go and development builds created before expo-glass-effect was
    // installed do not include ExpoGlassEffect. Keep the paywall dismissible
    // until the native app is rebuilt with the module linked.
    return false;
  }
}

/** Native iOS 26 liquid glass with a surfaced fallback for older systems. */
export function LiquidGlassCloseButton({ onPress }: LiquidGlassCloseButtonProps) {
  const theme = useTheme();
  const supportsGlass = canUseGlassEffect();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
      hitSlop={theme.hitSlopSize / 4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          width: theme.hitSlopSize,
          height: theme.hitSlopSize,
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

      <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
