import type { ColorScheme } from '@cal/ui';

/**
 * What the user picked, which is not the same thing as what is on screen:
 * `auto` defers to the OS appearance and so resolves differently over the day.
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

/**
 * Matches the web client's `THEME_STORAGE_KEY` so the two surfaces describe the
 * preference identically. The value is device-local on both — a phone set to
 * dark and a laptop set to light is a legitimate answer, not a sync bug.
 */
export const THEME_STORAGE_KEY = 'bcal_theme';

export const THEME_MODES: readonly ThemeMode[] = ['auto', 'light', 'dark'];

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

/**
 * `systemScheme` is React Native's `useColorScheme()`, which is `null` while the
 * OS value is still resolving. Dark is the fallback, matching the web.
 */
export function resolveThemeMode(
  mode: ThemeMode,
  systemScheme: ColorScheme | null | undefined,
): ColorScheme {
  if (mode === 'auto') return systemScheme === 'light' ? 'light' : 'dark';
  return mode;
}

export const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  auto: 'System default',
  light: 'Light mode',
  dark: 'Dark mode',
};

export const THEME_MODE_DESCRIPTION: Record<ThemeMode, string> = {
  auto: 'Follows your device appearance',
  light: 'Always light, whatever the device does',
  dark: 'Always dark, whatever the device does',
};
