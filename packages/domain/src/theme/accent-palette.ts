import { accentColorSchema, DEFAULT_ACCENT_COLOR } from '@cal/schemas';

/**
 * Turns one user-picked accent color into the full set of accent tokens for
 * light and dark mode. Pure and deterministic: the same hex always produces
 * the same palette.
 *
 * Work happens in OKLCH so lightness steps look the same for every hue. Each
 * mode's base shade is pushed lighter or darker, only as far as needed, until
 * it reads as text against that mode's surfaces. That is what lets any picked
 * color, including pale yellow or near-black, produce a usable UI.
 */

export interface AccentPreset {
  id: string;
  name: string;
  color: string;
}

/** Free for everyone. Any other color is a custom accent, which is Pro-only. */
export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'blue', name: 'Blue', color: DEFAULT_ACCENT_COLOR },
  { id: 'indigo', name: 'Indigo', color: '#4f46e5' },
  { id: 'violet', name: 'Violet', color: '#7c3aed' },
  { id: 'pink', name: 'Pink', color: '#db2777' },
  { id: 'red', name: 'Red', color: '#dc2626' },
  { id: 'orange', name: 'Orange', color: '#ea580c' },
  { id: 'green', name: 'Green', color: '#16a34a' },
  { id: 'teal', name: 'Teal', color: '#0d9488' },
];

export function isAccentPreset(color: string): boolean {
  const normalized = color.toLowerCase();
  return ACCENT_PRESETS.some((preset) => preset.color === normalized);
}

/**
 * The accent the app should show: presets for everyone, a custom color only
 * with Pro. `hasPro` is null while the entitlement is still loading, when the
 * saved choice is trusted so a Pro user's color never flickers to blue.
 */
export function resolveAccentColor(saved: string, hasPro: boolean | null): string {
  const parsed = accentColorSchema.safeParse(saved);
  if (!parsed.success) return DEFAULT_ACCENT_COLOR;
  if (hasPro === false && !isAccentPreset(parsed.data)) return DEFAULT_ACCENT_COLOR;
  return parsed.data;
}

export interface AccentTokens {
  accent: string;
  accentHover: string;
  accentPressed: string;
  /** Text and icon color on an accent fill. */
  onAccent: string;
  /** `r, g, b` of `accent`, for the translucent tints built from it. */
  accentRgb: string;
}

export interface AccentPalette {
  light: AccentTokens;
  dark: AccentTokens;
}

// WCAG AA: 4.5:1 for text. Light mode uses the accent as link and label text on
// white; dark mode mostly uses it as fills and icons, so it needs the 3:1 set
// for UI components, which keeps shades close to what was picked.
const LIGHT_MIN_CONTRAST = 4.5;
const DARK_MIN_CONTRAST = 3;
const TEXT_CONTRAST = 4.5;
// Lightest light-mode card and darkest dark-mode surface the accent sits on.
const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#13171e';
const ON_ACCENT_LIGHT = '#ffffff';
const ON_ACCENT_DARK = '#0a0d12';
// Keeps near-black and near-white picks recognisably colored rather than grey.
const MIN_LIGHTNESS = 0.32;
const MAX_LIGHTNESS = 0.86;

export function buildAccentPalette(color: string): AccentPalette {
  const parsed = accentColorSchema.safeParse(color);
  const base = hexToOklch(parsed.success ? parsed.data : DEFAULT_ACCENT_COLOR);

  // Light mode darkens until the accent reads on white; hover and pressed go darker.
  const light = adjustLightness(base, LIGHT_SURFACE, LIGHT_MIN_CONTRAST, -1);
  // Dark mode lightens until the accent reads on the dark surface; hover goes lighter.
  const dark = adjustLightness(base, DARK_SURFACE, DARK_MIN_CONTRAST, 1);

  return {
    light: tokensFor(light, -0.045, -0.09),
    dark: tokensFor(dark, 0.05, -0.04),
  };
}

function tokensFor(base: Oklch, hoverDelta: number, pressedDelta: number): AccentTokens {
  const accent = oklchToHex(base);
  // White labels match the default look; switch only when white would fail AA.
  const whiteContrast = contrastRatio(ON_ACCENT_LIGHT, accent);
  const onAccent =
    whiteContrast >= TEXT_CONTRAST || whiteContrast >= contrastRatio(ON_ACCENT_DARK, accent)
      ? ON_ACCENT_LIGHT
      : ON_ACCENT_DARK;
  const [r, g, b] = hexToRgb(accent).map((channel) => Math.round(channel * 255));
  return {
    accent,
    accentHover: oklchToHex(withLightness(base, base.l + hoverDelta)),
    accentPressed: oklchToHex(withLightness(base, base.l + pressedDelta)),
    onAccent,
    accentRgb: `${r}, ${g}, ${b}`,
  };
}

/** Steps lightness toward `direction` until the color reaches `minContrast` on `surface`. */
function adjustLightness(
  color: Oklch,
  surface: string,
  minContrast: number,
  direction: -1 | 1,
): Oklch {
  let current = withLightness(color, clamp(color.l, MIN_LIGHTNESS, MAX_LIGHTNESS));
  for (let step = 0; step < 60; step += 1) {
    if (contrastRatio(oklchToHex(current), surface) >= minContrast) return current;
    const next = current.l + direction * 0.01;
    if (next < 0.05 || next > 0.97) break;
    current = withLightness(current, next);
  }
  return current;
}

function withLightness(color: Oklch, l: number): Oklch {
  return { ...color, l: clamp(l, 0, 1) };
}

// --- Color math -------------------------------------------------------------
// sRGB <-> OKLab from Björn Ottosson, https://bottosson.github.io/posts/oklab/

interface Oklch {
  l: number;
  c: number;
  h: number;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(clamp(channel, 0, 1) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function oklchToLinearRgb({ l: L, c, h }: Oklch): Rgb {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut(rgb: Rgb): boolean {
  return rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);
}

/** Converts to hex, reducing chroma (never hue or lightness) to stay inside sRGB. */
function oklchToHex(color: Oklch): string {
  let linear = oklchToLinearRgb(color);
  if (!inGamut(linear)) {
    let low = 0;
    let high = color.c;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinearRgb({ ...color, c: mid }))) low = mid;
      else high = mid;
    }
    linear = oklchToLinearRgb({ ...color, c: low });
  }
  return rgbToHex(linear.map(fromLinear) as Rgb);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
