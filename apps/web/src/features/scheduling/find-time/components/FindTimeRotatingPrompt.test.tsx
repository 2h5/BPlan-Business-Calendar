import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FindTimeRotatingPrompt, startPromptRotation } from './FindTimeRotatingPrompt';

describe('FindTimeRotatingPrompt presentation', () => {
  it('renders a stable "Try" lead-in and a generated example', () => {
    const html = renderToStaticMarkup(<FindTimeRotatingPrompt random={() => 0} />);

    // Stable lead-in
    expect(html).toContain('>Try</span>');
    // A quoted generated example
    expect(html).toMatch(/“[^”]+”/);
    // Must be decorative only for accessibility
    expect(html).toContain('aria-hidden="true"');
  });

  it('renders custom examples when provided', () => {
    const customExamples = ['“30-minute sync with Sarah”', '“coffee tomorrow at 10”'];
    const html = renderToStaticMarkup(<FindTimeRotatingPrompt examples={customExamples} />);

    expect(html).toContain('>Try</span>');
    expect(html).toContain('“30-minute sync with Sarah”');
  });

  it('returns null when examples array is empty', () => {
    const html = renderToStaticMarkup(<FindTimeRotatingPrompt examples={[]} />);
    expect(html).toBe('');
  });
});

describe('startPromptRotation timer controller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('advances on each interval tick and triggers transition completion', () => {
    const onAdvance = vi.fn();
    const onTransitionEnd = vi.fn();

    const cleanup = startPromptRotation({
      intervalMs: 3600,
      transitionMs: 260,
      onAdvance,
      onTransitionEnd,
    });

    expect(onAdvance).not.toHaveBeenCalled();

    // Advance to first interval tick
    vi.advanceTimersByTime(3600);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onTransitionEnd).not.toHaveBeenCalled();

    // Advance through transition duration
    vi.advanceTimersByTime(260);
    expect(onTransitionEnd).toHaveBeenCalledTimes(1);

    // Advance to next interval tick
    vi.advanceTimersByTime(3600 - 260);
    expect(onAdvance).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(260);
    expect(onTransitionEnd).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it('pauses rotation while the document is hidden', () => {
    let isHidden = true;
    const onAdvance = vi.fn();
    const onTransitionEnd = vi.fn();

    const cleanup = startPromptRotation({
      intervalMs: 3600,
      transitionMs: 260,
      onAdvance,
      onTransitionEnd,
      isDocumentHidden: () => isHidden,
    });

    // Advance timer while hidden - should not advance
    vi.advanceTimersByTime(7200);
    expect(onAdvance).not.toHaveBeenCalled();

    // Make tab visible
    isHidden = false;
    vi.advanceTimersByTime(3600);
    expect(onAdvance).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('cleans up interval and transition timers upon unsubscribe', () => {
    const onAdvance = vi.fn();
    const onTransitionEnd = vi.fn();

    const cleanup = startPromptRotation({
      intervalMs: 3600,
      transitionMs: 260,
      onAdvance,
      onTransitionEnd,
    });

    // Advance to trigger advance and start transition timer
    vi.advanceTimersByTime(3600);
    expect(onAdvance).toHaveBeenCalledTimes(1);

    // Cleanup mid-transition
    cleanup();

    // Advancing timers should not fire transition end or further advances
    vi.advanceTimersByTime(10000);
    expect(onTransitionEnd).not.toHaveBeenCalled();
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
