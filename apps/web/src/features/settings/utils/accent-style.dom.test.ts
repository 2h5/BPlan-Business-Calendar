// @vitest-environment jsdom
import '../../../test/dom';

import { afterEach, describe, expect, it } from 'vitest';

import { applyAccent, buildAccentCss } from './accent-style';

describe('buildAccentCss', () => {
  it('emits nothing for the default blue, which theme.css already defines', () => {
    expect(buildAccentCss('#1768f2')).toBeNull();
    expect(buildAccentCss('#1768F2')).toBeNull();
  });

  it('scopes overrides to the signed-in app for dark, light, and system modes', () => {
    const css = buildAccentCss('#7c3aed') ?? '';
    expect(css).toContain('html[data-accent] {');
    expect(css).toContain("html[data-accent][data-theme='light'] {");
    expect(css).toContain('@media (prefers-color-scheme: light)');
    expect(css).toContain('--color-accent: #7c3aed;');
    expect(css).toContain('--color-accent-rgb: 124, 58, 237;');
  });
});

describe('applyAccent', () => {
  afterEach(() => applyAccent(null));

  it('injects one stylesheet and marks the document', () => {
    applyAccent('#7c3aed');
    applyAccent('#db2777');
    const styles = document.querySelectorAll('#bplan-accent');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('#db2777');
    expect(document.documentElement.hasAttribute('data-accent')).toBe(true);
  });

  it('removes the override for the default color or null', () => {
    applyAccent('#7c3aed');
    applyAccent('#1768f2');
    expect(document.getElementById('bplan-accent')).toBeNull();
    expect(document.documentElement.hasAttribute('data-accent')).toBe(false);
  });
});
