import { afterEach, describe, expect, it, vi } from 'vitest';

import { animateScrollTop } from './animate-scroll';
import { getNewEventAnchorRect } from './new-event-anchor';

vi.mock('./animate-scroll', () => ({ animateScrollTop: vi.fn() }));

const dayRect = { top: 100, bottom: 220, left: 200, right: 500, width: 300, height: 120 };

function stubDay(viewport: HTMLElement | null = null) {
  const getBoundingClientRect = vi.fn(() => dayRect);
  const closest = vi.fn(() => viewport);
  vi.stubGlobal('document', {
    querySelector: vi.fn(() => ({ getBoundingClientRect, closest })),
  });
  return { getBoundingClientRect, closest };
}

function stubViewport(scrollTop = 0) {
  return {
    scrollTop,
    clientHeight: 700,
    scrollHeight: 2000,
    getBoundingClientRect: vi.fn(() => ({ top: 0 })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('getNewEventAnchorRect', () => {
  it('returns null without a matching day element', () => {
    const querySelector = vi.fn(() => null);
    vi.stubGlobal('document', { querySelector });

    expect(getNewEventAnchorRect('2026-09-15', 540, 600, 'week')).toBeNull();
    expect(querySelector).toHaveBeenCalledWith('[data-date-key="2026-09-15"]');
  });

  it('passes through month cell geometry without looking for a viewport', () => {
    const day = stubDay();

    expect(getNewEventAnchorRect('2026-09-15', 540, 600, 'month')).toEqual(dayRect);
    expect(document.querySelector).toHaveBeenCalledWith('[data-date-key="2026-09-15"]');
    expect(day.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(day.closest).not.toHaveBeenCalled();
    expect(animateScrollTop).not.toHaveBeenCalled();
  });

  it('returns week slot geometry without scrolling when the slot is visible', () => {
    const viewport = stubViewport();
    const day = stubDay(viewport as unknown as HTMLElement);

    expect(getNewEventAnchorRect('2026-09-15', 540, 600, 'week')).toEqual({
      top: 586,
      bottom: 638,
      left: 200,
      right: 500,
      width: 300,
      height: 52,
    });
    expect(day.closest).toHaveBeenCalledWith('[data-timeline-viewport]');
    expect(viewport.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(animateScrollTop).not.toHaveBeenCalled();
  });

  it('adjusts the anchor before starting a scroll to reveal a late week slot', () => {
    const viewport = stubViewport();
    const day = stubDay(viewport as unknown as HTMLElement);
    vi.stubGlobal(
      'DOMRect',
      class {
        constructor(
          public left: number,
          public top: number,
          public width: number,
          public height: number,
        ) {}
        get right() {
          return this.left + this.width;
        }
      },
    );

    expect(getNewEventAnchorRect('2026-09-15', 1200, 1260, 'week')).toEqual({
      top: 300,
      bottom: 352,
      left: 200,
      right: 500,
      width: 300,
      height: 52,
    });
    expect(viewport.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(day.getBoundingClientRect.mock.invocationCallOrder[0]).toBeLessThan(
      viewport.getBoundingClientRect.mock.invocationCallOrder[0]!,
    );
    expect(animateScrollTop).toHaveBeenCalledWith(viewport, 880);
  });

  it('keeps the minimum draft height in day mode', () => {
    stubDay();

    expect(getNewEventAnchorRect('2026-09-15', 540, 555, 'day')).toEqual({
      top: 676,
      bottom: 698,
      left: 200,
      right: 500,
      width: 300,
      height: 22,
    });
  });
});
