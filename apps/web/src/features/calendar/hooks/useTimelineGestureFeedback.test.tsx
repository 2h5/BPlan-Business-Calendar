import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventOccurrence } from './useCalendarWindow';
import {
  GHOST_EXIT_ANIMATION_MS,
  SETTLE_ANIMATION_MS,
  useTimelineGestureFeedback,
  type TimelineExitingGhost,
  type TimelineGestureFeedback,
} from './useTimelineGestureFeedback';

/**
 * Runs the hook once and hands back its values and actions. The web tests have
 * no DOM, so state updates and effects (including the unmount cleanup) are not
 * observable here; these tests cover what the actions do with refs and timers.
 */
function renderHook(): TimelineGestureFeedback {
  let result: TimelineGestureFeedback | undefined;
  function Harness() {
    result = useTimelineGestureFeedback();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result!;
}

const ghost: TimelineExitingGhost = {
  occurrence: { key: 'evt-1::2026-09-15' } as unknown as EventOccurrence,
  dateKey: '2026-09-15',
  originalMinutes: { startMinute: 540, endMinute: 600 },
  originalLayout: { left: 0, width: 1 },
};

describe('useTimelineGestureFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no feedback showing', () => {
    const feedback = renderHook();

    expect(feedback.magneticSnap).toBeNull();
    expect(feedback.hasConflict).toBe(false);
    expect(feedback.snapDirection).toBeNull();
    expect(feedback.settledOccurrenceKey).toBeNull();
    expect(feedback.exitingGhost).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('suppresses only the suppressed key, and only once', () => {
    const feedback = renderHook();

    expect(feedback.shouldSuppressSelect('a')).toBe(false);
    feedback.suppressClick('a');
    expect(feedback.shouldSuppressSelect('b')).toBe(false);
    expect(feedback.shouldSuppressSelect('a')).toBe(true);
    expect(feedback.shouldSuppressSelect('a')).toBe(false);
  });

  it('releases a suppression on the next tick', () => {
    const feedback = renderHook();

    feedback.suppressClick('a');
    feedback.releaseSuppressedClickSoon('a');
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(0);

    expect(vi.getTimerCount()).toBe(0);
    expect(feedback.shouldSuppressSelect('a')).toBe(false);
  });

  it('keeps the suppression until the tick fires', () => {
    const feedback = renderHook();

    feedback.suppressClick('a');
    feedback.releaseSuppressedClickSoon('a');

    // A pointer-up's click lands before the zero-delay release.
    expect(feedback.shouldSuppressSelect('a')).toBe(true);
  });

  it('does not release a suppression that has since changed', () => {
    const feedback = renderHook();

    feedback.suppressClick('a');
    feedback.releaseSuppressedClickSoon('a');
    feedback.suppressClick('b');
    vi.advanceTimersByTime(0);

    expect(feedback.shouldSuppressSelect('b')).toBe(true);
  });

  it('releases only when the same key is still suppressed, even after re-suppressing it', () => {
    const feedback = renderHook();

    feedback.suppressClick('a');
    feedback.releaseSuppressedClickSoon('b');
    vi.advanceTimersByTime(0);
    expect(feedback.shouldSuppressSelect('a')).toBe(true);

    feedback.suppressClick('a');
    feedback.releaseSuppressedClickSoon('a');
    feedback.suppressClick('b');
    feedback.suppressClick('a');
    vi.advanceTimersByTime(0);
    expect(feedback.shouldSuppressSelect('a')).toBe(false);
  });

  it('runs the settle timer for the settle animation and restarts it on a new settle', () => {
    const feedback = renderHook();

    feedback.triggerSettle('a');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(SETTLE_ANIMATION_MS - 1);
    feedback.triggerSettle('b');
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(SETTLE_ANIMATION_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(SETTLE_ANIMATION_MS).toBe(180);
  });

  it('clears a running settle timer', () => {
    const feedback = renderHook();

    feedback.triggerSettle('a');
    feedback.clearSettle();
    expect(vi.getTimerCount()).toBe(0);

    // Also safe with nothing running.
    feedback.clearSettle();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs the exiting-ghost timer for the ghost exit animation', () => {
    const feedback = renderHook();

    feedback.showExitingGhost(ghost);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(GHOST_EXIT_ANIMATION_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(GHOST_EXIT_ANIMATION_MS).toBe(140);
  });

  it('restarts the exiting-ghost timer when another ghost is shown', () => {
    const feedback = renderHook();

    feedback.showExitingGhost(ghost);
    vi.advanceTimersByTime(100);
    feedback.showExitingGhost({ ...ghost, dateKey: '2026-09-16' });
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(GHOST_EXIT_ANIMATION_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a running exiting-ghost timer', () => {
    const feedback = renderHook();

    feedback.showExitingGhost(ghost);
    feedback.clearExitingGhost();
    expect(vi.getTimerCount()).toBe(0);

    feedback.clearExitingGhost();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the settle and ghost timers independent', () => {
    const feedback = renderHook();

    feedback.triggerSettle('a');
    feedback.showExitingGhost(ghost);
    expect(vi.getTimerCount()).toBe(2);

    feedback.clearExitingGhost();
    expect(vi.getTimerCount()).toBe(1);
    feedback.clearSettle();
    expect(vi.getTimerCount()).toBe(0);
  });
});
