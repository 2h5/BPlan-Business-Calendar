import { describe, expect, it } from 'vitest';

import {
  ACCENT_PRESETS,
  buildAccentPalette,
  contrastRatio,
  isAccentPreset,
  resolveAccentColor,
} from './accent-palette';

const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#13171e';
const HEX = /^#[0-9a-f]{6}$/;
// Presets plus the colors most likely to break a palette.
const COLORS = [
  ...ACCENT_PRESETS.map((preset) => preset.color),
  '#ffff00',
  '#fde68a',
  '#ffffff',
  '#000000',
  '#808080',
  '#00ffff',
];

describe('buildAccentPalette', () => {
  it('reproduces the default blue exactly in both modes', () => {
    const { light, dark } = buildAccentPalette('#1768f2');
    expect(light.accent).toBe('#1768f2');
    expect(dark.accent).toBe('#1768f2');
    expect(light.onAccent).toBe('#ffffff');
    expect(dark.onAccent).toBe('#ffffff');
    expect(light.accentRgb).toBe('23, 104, 242');
  });

  it('is deterministic and case-insensitive', () => {
    expect(buildAccentPalette('#DB2777')).toEqual(buildAccentPalette('#db2777'));
  });

  it('falls back to the default for invalid input', () => {
    expect(buildAccentPalette('not a color')).toEqual(buildAccentPalette('#1768f2'));
  });

  it.each(COLORS)('keeps %s readable in both modes', (color) => {
    const { light, dark } = buildAccentPalette(color);
    for (const tokens of [light, dark]) {
      for (const value of [tokens.accent, tokens.accentHover, tokens.accentPressed]) {
        expect(value).toMatch(HEX);
      }
      expect(contrastRatio(tokens.onAccent, tokens.accent)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio(light.accent, LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.accent, DARK_SURFACE)).toBeGreaterThanOrEqual(3);
  });

  it('makes hover and pressed distinct from the base shade', () => {
    const { light, dark } = buildAccentPalette('#16a34a');
    expect(new Set([light.accent, light.accentHover, light.accentPressed]).size).toBe(3);
    expect(new Set([dark.accent, dark.accentHover, dark.accentPressed]).size).toBe(3);
  });
});

describe('resolveAccentColor', () => {
  it('allows presets without Pro', () => {
    expect(resolveAccentColor('#7c3aed', false)).toBe('#7c3aed');
  });

  it('drops a custom color when Pro is known to be inactive', () => {
    expect(resolveAccentColor('#123456', false)).toBe('#1768f2');
  });

  it('keeps a custom color with Pro, and while the entitlement is loading', () => {
    expect(resolveAccentColor('#123456', true)).toBe('#123456');
    expect(resolveAccentColor('#123456', null)).toBe('#123456');
  });

  it('falls back to the default for an invalid color', () => {
    expect(resolveAccentColor('blue', true)).toBe('#1768f2');
  });
});

describe('isAccentPreset', () => {
  it('matches presets regardless of case', () => {
    expect(isAccentPreset('#4F46E5')).toBe(true);
    expect(isAccentPreset('#4f46e6')).toBe(false);
  });
});
