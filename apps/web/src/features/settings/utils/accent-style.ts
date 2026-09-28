import { buildAccentPalette, type AccentTokens } from '@cal/domain';
import { DEFAULT_ACCENT_COLOR } from '@cal/schemas';

/**
 * Applies the user's accent by injecting one stylesheet that overrides the
 * accent tokens in `theme.css`. Every translucent accent tint derives from
 * `--color-accent-rgb`, so these few tokens recolor the whole app.
 *
 * The rules only match while `<html data-accent>` is set, which the signed-in
 * app shell owns, so public pages (sign-in, pricing) always stay BPlan blue.
 * Selectors start with `html` to outrank the `:root[...]` rules in theme.css.
 */

const STYLE_ELEMENT_ID = 'bplan-accent';
const ACCENT_ATTRIBUTE = 'data-accent';

function declarations(tokens: AccentTokens, indent: string): string {
  return [
    `--color-accent: ${tokens.accent};`,
    `--color-accent-rgb: ${tokens.accentRgb};`,
    `--color-accent-hover: ${tokens.accentHover};`,
    `--color-accent-pressed: ${tokens.accentPressed};`,
    `--color-on-accent: ${tokens.onAccent};`,
  ]
    .map((line) => indent + line)
    .join('\n');
}

/** The stylesheet for `color`, or null for the default, which theme.css already covers. */
export function buildAccentCss(color: string): string | null {
  if (color.toLowerCase() === DEFAULT_ACCENT_COLOR) return null;
  const { light, dark } = buildAccentPalette(color);
  return `html[${ACCENT_ATTRIBUTE}] {
${declarations(dark, '  ')}
}
html[${ACCENT_ATTRIBUTE}][data-theme='light'] {
${declarations(light, '  ')}
}
@media (prefers-color-scheme: light) {
  html[${ACCENT_ATTRIBUTE}][data-theme='auto'],
  html[${ACCENT_ATTRIBUTE}]:not([data-theme]) {
${declarations(light, '    ')}
  }
}
`;
}

/** Applies `color` to the document; null removes any custom accent. */
export function applyAccent(color: string | null): void {
  const root = document.documentElement;
  const css = color ? buildAccentCss(color) : null;
  const existing = document.getElementById(STYLE_ELEMENT_ID);

  if (!css) {
    existing?.remove();
    root.removeAttribute(ACCENT_ATTRIBUTE);
    return;
  }

  const style = existing ?? document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  if (style.textContent !== css) style.textContent = css;
  if (!existing) document.head.appendChild(style);
  root.setAttribute(ACCENT_ATTRIBUTE, '');
}
