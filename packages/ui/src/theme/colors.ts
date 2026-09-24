/**
 * Semantic colour tokens.
 *
 * Components never reference a raw hex value — they name the *role* (`surface`,
 * `textSecondary`, `accent`). That is what makes a genuinely good dark mode
 * possible rather than a washed-out inversion of the light one.
 *
 * The values mirror the web client's CSS custom properties
 * (`apps/web/src/styles/theme.css`) so the two surfaces read as one product.
 * When a token changes there, change it here — the role names line up
 * one-for-one with the `--color-*` variables.
 */
export interface ColorTokens {
  /** Page background — web `--color-bg-app`. */
  background: string;
  /** Chrome that frames the page: tab bar, headers — web `--color-bg-sidebar`. */
  backgroundElevated: string;
  /** Cards and panels — web `--color-bg-surface`. */
  surface: string;
  /** A surface sitting on a surface — web `--color-bg-surface-raised`. */
  surfaceRaised: string;
  /** Sheets, popovers, secondary buttons — web `--color-bg-surface-elevated`. */
  surfaceElevated: string;
  surfacePressed: string;
  /** Text input fill — web `--color-bg-input`. */
  inputBackground: string;

  /** Hairline dividers inside a surface — web `--color-border-subtle`. */
  borderSubtle: string;
  border: string;
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  accent: string;
  accentHover: string;
  accentPressed: string;
  accentSubtle: string;
  /** Barely-there accent wash, e.g. a gradient bloom behind the sign-in card. */
  accentMuted: string;
  onAccent: string;

  /** Persistent selection fill, e.g. the active tab or today's date. */
  selected: string;
  /** Transient press/hover fill layered over any surface. */
  hover: string;
  /** Focus ring around a focused input. */
  focusRing: string;
  /** A second, violet accent used where a surface needs to differ from `accent`. */
  focusAccent: string;
  focusAccentSubtle: string;

  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerHover: string;
  dangerSubtle: string;

  /** Timeline furniture in the calendar views. */
  gridLine: string;
  nowIndicator: string;
  scrim: string;
}

export const darkColors: ColorTokens = {
  background: '#0B0D12',
  backgroundElevated: '#101319',
  surface: '#13171E',
  surfaceRaised: '#181D26',
  surfaceElevated: '#1D2330',
  surfacePressed: '#252C39',
  inputBackground: '#0F131A',

  borderSubtle: '#1E242E',
  border: '#29313E',
  borderStrong: '#3A4555',

  textPrimary: '#F3F5F8',
  textSecondary: '#AEB6C4',
  textTertiary: '#737D8D',
  textInverse: '#0A0D12',

  accent: '#196AF3',
  accentHover: '#3A80F5',
  accentPressed: '#1459D1',
  accentSubtle: 'rgba(25, 106, 243, 0.16)',
  accentMuted: 'rgba(25, 106, 243, 0.09)',
  onAccent: '#FFFFFF',

  selected: 'rgba(25, 106, 243, 0.13)',
  hover: 'rgba(255, 255, 255, 0.045)',
  focusRing: 'rgba(25, 106, 243, 0.32)',
  focusAccent: '#196AF3',
  focusAccentSubtle: 'rgba(25, 106, 243, 0.16)',

  success: '#61D6A2',
  successSubtle: 'rgba(60, 200, 139, 0.12)',
  warning: '#E7B660',
  warningSubtle: 'rgba(231, 182, 96, 0.12)',
  danger: '#FF7D84',
  dangerHover: '#FF9298',
  dangerSubtle: 'rgba(255, 111, 120, 0.11)',

  gridLine: '#1E242E',
  nowIndicator: '#FF7D84',
  scrim: 'rgba(7, 9, 13, 0.72)',
};

export const lightColors: ColorTokens = {
  background: '#F4F6F8',
  backgroundElevated: '#F8F9FB',
  surface: '#FFFFFF',
  surfaceRaised: '#F9FAFC',
  surfaceElevated: '#F1F3F7',
  surfacePressed: '#E7EAF0',
  inputBackground: '#FFFFFF',

  borderSubtle: '#EAEDF1',
  border: '#D9DDE5',
  borderStrong: '#C5CBD5',

  textPrimary: '#171B23',
  textSecondary: '#596273',
  textTertiary: '#8991A0',
  textInverse: '#FFFFFF',

  accent: '#196AF3',
  accentHover: '#1560DD',
  accentPressed: '#1254C4',
  accentSubtle: 'rgba(25, 106, 243, 0.10)',
  accentMuted: 'rgba(25, 106, 243, 0.06)',
  onAccent: '#FFFFFF',

  selected: 'rgba(25, 106, 243, 0.08)',
  hover: 'rgba(24, 31, 43, 0.035)',
  focusRing: 'rgba(25, 106, 243, 0.24)',
  focusAccent: '#196AF3',
  focusAccentSubtle: 'rgba(25, 106, 243, 0.10)',

  success: '#16865A',
  successSubtle: 'rgba(22, 134, 90, 0.10)',
  warning: '#A66A12',
  warningSubtle: 'rgba(166, 106, 18, 0.10)',
  danger: '#C94049',
  dangerHover: '#AD3039',
  dangerSubtle: 'rgba(201, 64, 73, 0.085)',

  gridLine: '#EAEDF1',
  nowIndicator: '#C94049',
  scrim: 'rgba(26, 31, 40, 0.28)',
};

/** Palette offered when creating a calendar, list, or tag. */
export const PALETTE = [
  '#6E8BFF',
  '#3ECF8E',
  '#F5B759',
  '#FF6B6B',
  '#B476FF',
  '#39C0D6',
  '#FF8FB1',
  '#8C93A8',
] as const;
