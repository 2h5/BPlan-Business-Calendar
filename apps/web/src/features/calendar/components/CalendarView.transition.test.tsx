import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCalendarViewTransition } from '../hooks/useCalendarViewTransition';
import * as viewTransition from '../utils/view-transition';

const { getTransitionOrigin, getViewTransitionDirection } = viewTransition;

type TransitionInput = Parameters<
  ReturnType<typeof useCalendarViewTransition>['startTransition']
>[0];

function renderTransitionHook(): ReturnType<typeof useCalendarViewTransition> {
  let result: ReturnType<typeof useCalendarViewTransition> | undefined;
  function Harness() {
    result = useCalendarViewTransition();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result!;
}

const transitionInput: TransitionInput = {
  fromMode: 'month',
  toMode: 'week',
  selectedDateKey: '2026-09-15',
  timeZone: 'UTC',
  weekStartsOn: 0,
  dateKeys: ['2026-09-15'],
};

describe('CalendarView Spatial Transitions Lifecycle & Hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: false })) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('determines correct transition directions across all view pairs', () => {
    // Zooming in (deeper hierarchy)
    expect(getViewTransitionDirection('month', 'week')).toBe('in');
    expect(getViewTransitionDirection('month', 'day')).toBe('in');
    expect(getViewTransitionDirection('week', 'day')).toBe('in');

    // Pulling back out (broader hierarchy)
    expect(getViewTransitionDirection('day', 'week')).toBe('out');
    expect(getViewTransitionDirection('day', 'month')).toBe('out');
    expect(getViewTransitionDirection('week', 'month')).toBe('out');

    // Same view (no transition)
    expect(getViewTransitionDirection('day', 'day')).toBeNull();
    expect(getViewTransitionDirection('week', 'week')).toBeNull();
    expect(getViewTransitionDirection('month', 'month')).toBeNull();
  });

  it('calculates spatially continuous transform-origin based on selected date', () => {
    // Thursday Sep 17, 2026 (weekday 4 with weekStartsOn=0)
    // colIndex = 4 -> ((4 + 0.5) / 7) * 100 = 64.29%
    const weekToDay = getTransitionOrigin({
      fromMode: 'week',
      toMode: 'day',
      selectedDateKey: '2026-09-17',
      timeZone: 'UTC',
      weekStartsOn: 0,
    });
    expect(weekToDay).toEqual({ x: 64.29, y: 50 });

    // In Month view (6 rows):
    // Sep 1, 2026 is Tuesday. daysBefore = 2.
    // Sep 17: gridIdx = 2 + (17 - 1) = 17 -> rowIndex = 2
    // rowIndex = 2 -> ((2 + 0.5) / 6) * 100 = 41.67%
    // colIndex = 17 % 7 = 3 -> ((3 + 0.5) / 7) * 100 = 50.0%
    const monthToWeek = getTransitionOrigin({
      fromMode: 'month',
      toMode: 'week',
      selectedDateKey: '2026-09-17',
      timeZone: 'UTC',
      weekStartsOn: 0,
    });
    expect(monthToWeek).toEqual({ x: 64.29, y: 41.67 });
  });

  it('correctly anchors Day -> Week relative to weekStartsOn=1 with single-day dateKeys', () => {
    // 2026-09-16 is Wednesday.
    // In Day view, calendarWindow.dateKeys is ['2026-09-16'].
    // When weekStartsOn=1, Wednesday is column 2 (35.71%), NOT column 0 (7.14%).
    const origin = getTransitionOrigin({
      fromMode: 'day',
      toMode: 'week',
      selectedDateKey: '2026-09-16',
      timeZone: 'UTC',
      weekStartsOn: 1,
      dateKeys: ['2026-09-16'],
    });
    expect(origin).toEqual({ x: 35.71, y: 50 });
  });

  it('uses the current origin context and clears its timer after 240 ms', () => {
    const origin = vi.spyOn(viewTransition, 'getTransitionOrigin');
    const transition = renderTransitionHook();

    transition.startTransition({ ...transitionInput, targetDateKey: '2026-09-17' });

    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(origin).toHaveBeenCalledWith({
      fromMode: 'month',
      toMode: 'week',
      selectedDateKey: '2026-09-17',
      timeZone: 'UTC',
      weekStartsOn: 0,
      dateKeys: transitionInput.dateKeys,
    });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(239);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces pending timers across rapid view switches', () => {
    const direction = vi.spyOn(viewTransition, 'getViewTransitionDirection');
    const origin = vi.spyOn(viewTransition, 'getTransitionOrigin');
    const transition = renderTransitionHook();
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    transition.startTransition(transitionInput);
    vi.advanceTimersByTime(50);
    transition.startTransition({
      ...transitionInput,
      fromMode: 'week',
      toMode: 'day',
      selectedDateKey: '2026-09-18',
      timeZone: 'America/New_York',
      weekStartsOn: 1,
      dateKeys: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'],
    });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(direction).toHaveBeenNthCalledWith(2, 'week', 'day');
    expect(origin).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        selectedDateKey: '2026-09-18',
        timeZone: 'America/New_York',
        weekStartsOn: 1,
      }),
    );
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(50);
    transition.startTransition({ ...transitionInput, fromMode: 'day', toMode: 'month' });
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(239);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a pending timer immediately when reduced motion is preferred', () => {
    const origin = vi.spyOn(viewTransition, 'getTransitionOrigin');
    const transition = renderTransitionHook();
    transition.startTransition(transitionInput);
    expect(vi.getTimerCount()).toBe(1);

    vi.stubGlobal('window', { matchMedia: vi.fn(() => ({ matches: true })) });
    transition.startTransition({ ...transitionInput, fromMode: 'week', toMode: 'day' });

    expect(vi.getTimerCount()).toBe(0);
    expect(origin).toHaveBeenCalledTimes(1);
  });

  it('clears a pending timer when direction is absent', () => {
    const transition = renderTransitionHook();
    transition.startTransition(transitionInput);
    expect(vi.getTimerCount()).toBe(1);

    transition.startTransition({ ...transitionInput, toMode: 'month' });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('verifies CSS rules in CalendarView.module.css satisfy Chromium hardening and reduced-motion', () => {
    const cssPath = resolve(__dirname, 'CalendarView.module.css');
    const css = readFileSync(cssPath, 'utf8');

    // 1. Duration and easing
    expect(css).toContain('animation: viewZoomIn 220ms cubic-bezier(0.16, 1, 0.3, 1)');
    expect(css).toContain('animation: viewZoomOut 220ms cubic-bezier(0.16, 1, 0.3, 1)');

    // 2. Micro scale keyframes with terminal transform: none
    expect(css).toContain('@keyframes viewZoomIn {');
    expect(css).toContain('transform: scale(1.018);');
    expect(css).toContain('@keyframes viewZoomOut {');
    expect(css).toContain('transform: scale(0.982);');

    // 3. Both keyframes must terminate at transform: none
    const zoomInBlock = css.slice(
      css.indexOf('@keyframes viewZoomIn {'),
      css.indexOf('@keyframes viewZoomOut {'),
    );
    expect(zoomInBlock).toContain('transform: none;');

    const zoomOutBlock = css.slice(
      css.indexOf('@keyframes viewZoomOut {'),
      css.indexOf('@keyframes viewFade {'),
    );
    expect(zoomOutBlock).toContain('transform: none;');

    // 4. Reduced-motion rule must override with !important
    const reducedMotionIdx = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const reducedMotionBlock = css.slice(
      reducedMotionIdx,
      css.indexOf('}', css.indexOf('animation: none !important;', reducedMotionIdx)) + 1,
    );
    expect(reducedMotionBlock).toContain('.calendarViewTransition');
    expect(reducedMotionBlock).toContain('.viewTransitionZoomIn');
    expect(reducedMotionBlock).toContain('.viewTransitionZoomOut');
    expect(reducedMotionBlock).toContain('animation: none !important;');
    expect(reducedMotionBlock).toContain('transform: none !important;');
  });
});
