import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCalendarToast } from './useCalendarToast';

/** Server rendering exposes callback/ref timer effects, but not state updates or effect cleanup. */
function renderHook(): ReturnType<typeof useCalendarToast> {
  let result: ReturnType<typeof useCalendarToast> | undefined;
  function Harness() {
    result = useCalendarToast();
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result!;
}

describe('useCalendarToast timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps direct setToast separate from scheduled dismissal', () => {
    const toast = renderHook();

    toast.setToast({ message: 'Create or connect a writable calendar first.' });
    expect(vi.getTimerCount()).toBe(0);

    toast.showToast({ message: 'Timed' });
    toast.setToast({ message: 'Create or connect a writable calendar first.' });
    expect(vi.getTimerCount()).toBe(1);
  });

  it('dismisses a normal toast after 6000ms, then clears it after the 180ms exit', () => {
    const toast = renderHook();

    toast.showToast({ message: 'Event moved' });
    vi.advanceTimersByTime(5999);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(179);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses 3000ms for success and accepts the caller-provided 8000ms duration', () => {
    const toast = renderHook();

    toast.showSuccess('Event created.');
    vi.advanceTimersByTime(2999);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(1);

    toast.showToast({ message: 'Event deleted.', actionLabel: 'Undo', onAction: vi.fn() }, 8000);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(7999);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(180);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces a pending dismissal timer when a new toast appears', () => {
    const toast = renderHook();

    toast.showToast({ message: 'First' });
    vi.advanceTimersByTime(2000);
    toast.showToast({ message: 'Second' });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(5999);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(180);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds the toast and resumes its remaining duration after release', () => {
    const toast = renderHook();

    toast.showToast({ message: 'Event moved' });
    vi.advanceTimersByTime(2000);
    toast.holdToast();
    toast.holdToast();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);

    toast.releaseToast();
    toast.releaseToast();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(3999);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(180);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives a held toast at least 1500ms after release', () => {
    const toast = renderHook();

    toast.showToast({ message: 'Event moved' });
    vi.advanceTimersByTime(5500);
    toast.holdToast();
    vi.advanceTimersByTime(5000);
    toast.releaseToast();
    vi.advanceTimersByTime(1499);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(180);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('defers scheduling a replacement shown during a hold until release', () => {
    const toast = renderHook();

    toast.showToast({ message: 'First' });
    toast.holdToast();
    toast.showToast({ message: 'Second' }, 8000);
    expect(vi.getTimerCount()).toBe(0);
    toast.releaseToast();
    vi.advanceTimersByTime(7999);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(1);
  });
});
