import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FIND_TIME_PROMPT_EXAMPLES,
  FindTimeRotatingPrompt,
  startPromptRotation,
} from './FindTimeRotatingPrompt';

describe('FindTimeRotatingPrompt examples and presentation', () => {
  it('defines a curated set of realistic BPlan scheduling examples', () => {
    expect(FIND_TIME_PROMPT_EXAMPLES).toHaveLength(6);

    // Verify key scheduling capability categories are represented
    expect(FIND_TIME_PROMPT_EXAMPLES).toContain('“15-minute meeting with Andrew”');
    expect(FIND_TIME_PROMPT_EXAMPLES).toContain('“lunch next Friday around noon”');
    expect(FIND_TIME_PROMPT_EXAMPLES).toContain('“90 minutes of deep work next week”');
    expect(FIND_TIME_PROMPT_EXAMPLES).toContain('“dentist Tuesday at 2”');
    expect(FIND_TIME_PROMPT_EXAMPLES).toContain('“hike this Saturday morning”');
    expect(FIND_TIME_PROMPT_EXAMPLES).toContain('“dinner Friday at 8”');
  });

  it('renders stable "Try" lead-in and first curated example by default', () => {
    const html = renderToStaticMarkup(<FindTimeRotatingPrompt />);

    // Stable lead-in
    expect(html).toContain('>Try</span>');
    // First curated example
    expect(html).toContain('“15-minute meeting with Andrew”');
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

  it('does not start timers when totalCount is 0 or 1', () => {
    const onAdvance = vi.fn();
    const onTransitionEnd = vi.fn();

    const cleanup = startPromptRotation({
      totalCount: 1,
      intervalMs: 3600,
      transitionMs: 260,
      onAdvance,
      onTransitionEnd,
    });

    vi.advanceTimersByTime(10000);
    expect(onAdvance).not.toHaveBeenCalled();
    expect(onTransitionEnd).not.toHaveBeenCalled();
    cleanup();
  });

  it('advances index on each interval tick and triggers transition completion', () => {
    const onAdvance = vi.fn();
    const onTransitionEnd = vi.fn();

    const cleanup = startPromptRotation({
      totalCount: 3,
      intervalMs: 3600,
      transitionMs: 260,
      onAdvance,
      onTransitionEnd,
    });

    expect(onAdvance).not.toHaveBeenCalled();

    // Advance to first interval tick
    vi.advanceTimersByTime(3600);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance).toHaveBeenLastCalledWith(1, 0); // next: 1, prev: 0
    expect(onTransitionEnd).not.toHaveBeenCalled();

    // Advance through transition duration
    vi.advanceTimersByTime(260);
    expect(onTransitionEnd).toHaveBeenCalledTimes(1);

    // Advance to next interval tick
    vi.advanceTimersByTime(3600 - 260);
    expect(onAdvance).toHaveBeenCalledTimes(2);
    expect(onAdvance).toHaveBeenLastCalledWith(2, 1); // next: 2, prev: 1

    vi.advanceTimersByTime(260);
    expect(onTransitionEnd).toHaveBeenCalledTimes(2);

    // Advance past third interval (wraps around to 0)
    vi.advanceTimersByTime(3600 - 260);
    expect(onAdvance).toHaveBeenCalledTimes(3);
    expect(onAdvance).toHaveBeenLastCalledWith(0, 2); // next: 0, prev: 2

    cleanup();
  });

  it('pauses rotation while the document is hidden', () => {
    let isHidden = true;
    const onAdvance = vi.fn();
    const onTransitionEnd = vi.fn();

    const cleanup = startPromptRotation({
      totalCount: 3,
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
    expect(onAdvance).toHaveBeenCalledWith(1, 0);

    cleanup();
  });

  it('cleans up interval and transition timers upon unsubscribe', () => {
    const onAdvance = vi.fn();
    const onTransitionEnd = vi.fn();

    const cleanup = startPromptRotation({
      totalCount: 3,
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
