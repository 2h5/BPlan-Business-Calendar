import { type ColorTokens, darkColors, lightColors } from './colors';
import { borderWidth, elevation, motion, radius, spacing } from './tokens';
import { typography } from './typography';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  borderWidth: typeof borderWidth;
  motion: typeof motion;
  typography: typeof typography;
  /** Standard horizontal page inset. Cards align to this. */
  screenPadding: number;
  /** Minimum tappable size, per Apple's HIG. */
  hitSlopSize: number;
  /** Height of an input or a default-size button — web `--control-height`. */
  controlHeight: number;
  /** Compact control height — web `--control-height-sm`. */
  controlHeightSm: number;
}

const base = {
  spacing,
  radius,
  elevation,
  borderWidth,
  motion,
  typography,
  screenPadding: spacing.xl,
  hitSlopSize: 44,
  controlHeight: 40,
  controlHeightSm: 34,
} as const;

export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, ...base };
export const lightTheme: Theme = { scheme: 'light', colors: lightColors, ...base };

export const themeFor = (scheme: ColorScheme): Theme =>
  scheme === 'dark' ? darkTheme : lightTheme;
