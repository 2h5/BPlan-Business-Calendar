import { describe, expect, it } from 'vitest';

import { resolveEventColor } from './colour';

describe('resolveEventColor', () => {
  it('prefers the event override', () => {
    expect(resolveEventColor('#ff0000', '#00ff00', '#0000ff')).toBe('#ff0000');
  });

  it('inherits the calendar colour when the event has none', () => {
    expect(resolveEventColor(null, '#00ff00', '#0000ff')).toBe('#00ff00');
  });

  it('treats an absent override the same as an explicit null', () => {
    expect(resolveEventColor(undefined, '#00ff00', '#0000ff')).toBe('#00ff00');
  });

  it('falls back when neither the event nor its calendar has a colour', () => {
    expect(resolveEventColor(null, null, '#0000ff')).toBe('#0000ff');
  });

  it('falls back when the calendar itself is missing', () => {
    expect(resolveEventColor(null, undefined, '#0000ff')).toBe('#0000ff');
  });
});
