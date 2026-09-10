import { Platform, type TextStyle } from 'react-native';

/**
 * One type scale for the whole product. Adding a new variant is a design
 * decision, not a styling shortcut — reach for an existing one first.
 *
 * Sizes are the web client's rem scale resolved at its 16px root
 * (`--font-size-xs` … `--font-size-3xl`), and headings carry the same negative
 * tracking the web uses so a title reads identically on both surfaces.
 */
export type TextVariant =
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'bodyStrong'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'mono';

/**
 * The web stack is `Inter, ui-sans-serif, -apple-system, …`. Inter is not
 * bundled with the app, so we land on the same `-apple-system` fallback the web
 * uses on an Apple device — San Francisco — rather than shipping a second face.
 */
const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const monoFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const typography: Record<TextVariant, TextStyle> = {
  display: {
    fontFamily: systemFont,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: -1.1,
  },
  title1: {
    fontFamily: systemFont,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '600',
    letterSpacing: -0.9,
  },
  title2: {
    fontFamily: systemFont,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600',
    letterSpacing: -0.6,
  },
  title3: {
    fontFamily: systemFont,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  headline: {
    fontFamily: systemFont,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
  body: { fontFamily: systemFont, fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontFamily: systemFont, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  callout: { fontFamily: systemFont, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  subhead: { fontFamily: systemFont, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  footnote: { fontFamily: systemFont, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: {
    fontFamily: systemFont,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  mono: { fontFamily: monoFont, fontSize: 13, lineHeight: 18, fontWeight: '400' },
};
