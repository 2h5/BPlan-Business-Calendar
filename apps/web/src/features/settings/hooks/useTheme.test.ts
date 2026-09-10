import { describe, expect, it } from 'vitest';

import { isValidThemeMode, resolveThemeMode, THEME_STORAGE_KEY } from './useTheme';

describe('Theme resolution and validation', () => {
  it('identifies valid theme modes', () => {
    expect(isValidThemeMode('auto')).toBe(true);
    expect(isValidThemeMode('light')).toBe(true);
    expect(isValidThemeMode('dark')).toBe(true);
    expect(isValidThemeMode('system')).toBe(false);
    expect(isValidThemeMode('')).toBe(false);
    expect(isValidThemeMode(null)).toBe(false);
    expect(isValidThemeMode(undefined)).toBe(false);
  });

  it('resolves auto theme according to system preference', () => {
    expect(resolveThemeMode('auto', true)).toBe('light');
    expect(resolveThemeMode('auto', false)).toBe('dark');
  });

  it('resolves explicit light and dark themes regardless of system preference', () => {
    expect(resolveThemeMode('light', false)).toBe('light');
    expect(resolveThemeMode('light', true)).toBe('light');

    expect(resolveThemeMode('dark', true)).toBe('dark');
    expect(resolveThemeMode('dark', false)).toBe('dark');
  });

  it('uses the standard storage key for theme persistence', () => {
    expect(THEME_STORAGE_KEY).toBe('bplan_theme');
  });
});
