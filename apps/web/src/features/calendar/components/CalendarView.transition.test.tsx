import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTransitionOrigin,
  getViewTransitionDirection,
  type ViewTransitionState,
} from '../utils/view-transition';

describe('CalendarView Spatial Transitions Lifecycle & Hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
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

  it('manages transition timer and settles cleanly to null (terminal transform: none)', () => {
    let transitionState: ViewTransitionState | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const startTransition = (from: 'month' | 'week' | 'day', to: 'month' | 'week' | 'day') => {
      const direction = getViewTransitionDirection(from, to);
      if (direction) {
        const origin = getTransitionOrigin({
          fromMode: from,
          toMode: to,
          selectedDateKey: '2026-09-15',
          timeZone: 'UTC',
        });
        transitionState = { direction, origin };

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          transitionState = null;
          timer = null;
        }, 240);
      }
      return transitionState;
    };

    // Trigger transition Month -> Week
    const active = startTransition('month', 'week');
    expect(active).not.toBeNull();
    expect(active?.direction).toBe('in');

    // Advance 100ms: transition still running
    vi.advanceTimersByTime(100);
    expect(transitionState as ViewTransitionState | null).not.toBeNull();

    // Advance past 240ms: transition cleared to null
    vi.advanceTimersByTime(140);
    expect(transitionState as ViewTransitionState | null).toBeNull();
  });

  it('handles rapid sequential view switches without stuck intermediate states', () => {
    let transitionState: ViewTransitionState | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const startTransition = (from: 'month' | 'week' | 'day', to: 'month' | 'week' | 'day') => {
      const direction = getViewTransitionDirection(from, to);
      if (direction) {
        const origin = getTransitionOrigin({
          fromMode: from,
          toMode: to,
          selectedDateKey: '2026-09-15',
          timeZone: 'UTC',
        });
        transitionState = { direction, origin };

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          transitionState = null;
          timer = null;
        }, 240);
      }
      return transitionState;
    };

    // Switch 1: Month -> Week
    expect(startTransition('month', 'week')?.direction).toBe('in');

    // 50ms later, rapid switch: Week -> Day
    vi.advanceTimersByTime(50);
    expect(startTransition('week', 'day')?.direction).toBe('in');

    // 50ms later, rapid switch: Day -> Month
    vi.advanceTimersByTime(50);
    expect(startTransition('day', 'month')?.direction).toBe('out');

    // Advance 240ms after last switch: settles cleanly to null
    vi.advanceTimersByTime(240);
    expect(transitionState as ViewTransitionState | null).toBeNull();
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
