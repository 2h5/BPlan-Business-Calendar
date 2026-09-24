import { isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

/** Whether native iOS 26 liquid glass can render here; callers draw a flat fallback otherwise. */
export function canUseGlassEffect(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  try {
    return isGlassEffectAPIAvailable();
  } catch {
    // Expo Go and development builds created before expo-glass-effect was
    // installed do not include ExpoGlassEffect. Fall back to the flat surface
    // until the native app is rebuilt with the module linked.
    return false;
  }
}
