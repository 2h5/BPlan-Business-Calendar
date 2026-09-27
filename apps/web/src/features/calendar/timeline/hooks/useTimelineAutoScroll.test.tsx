import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useTimelineAutoScroll,
  type TimelineAutoScroll,
  type UseTimelineAutoScrollOptions,
} from './useTimelineAutoScroll';
import { AUTO_SCROLL_MAX_SPEED_PX } from '../utils/event-auto-scroll';

/** A 500 px tall viewport at the top of the page over 2,000 px of content. */
function createContainer(scrollTop = 500) {
  return {
    scrollTop,
    scrollHeight: 2000,
    clientHeight: 500,
    getBoundingClientRect: () => ({ top: 0, bottom: 500, height: 500 }),
  };
}

type Container = ReturnType<typeof createContainer>;

interface Gesture {
  moveDragging: boolean;
  resizeActive: boolean;
  applyResizeAt: ReturnType<typeof vi.fn<UseTimelineAutoScrollOptions['applyResizeAt']>>;
  applyMoveAt: ReturnType<typeof vi.fn<UseTimelineAutoScrollOptions['applyMoveAt']>>;
}

/**
 * Runs the hook once against a stub scroll container. The web tests have no
 * DOM, so the rAF unmount cleanup is not observable here; these tests cover
 * the probe, the loop and the pointer actions.
 */
function renderHook(container: Container | null, gesture: Gesture): TimelineAutoScroll {
  let result: TimelineAutoScroll | undefined;
  const scrollRef = { current: container as unknown as HTMLDivElement | null };
  function Harness() {
    result = useTimelineAutoScroll(scrollRef, {
      isMoveDragging: () => gesture.moveDragging,
      isResizeActive: () => gesture.resizeActive,
      applyResizeAt: gesture.applyResizeAt,
      applyMoveAt: gesture.applyMoveAt,
    });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result!;
}

function createGesture(overrides: Partial<Pick<Gesture, 'moveDragging' | 'resizeActive'>> = {}) {
  return {
    moveDragging: false,
    resizeActive: false,
    applyResizeAt: vi.fn<UseTimelineAutoScrollOptions['applyResizeAt']>(),
    applyMoveAt: vi.fn<UseTimelineAutoScrollOptions['applyMoveAt']>(),
    ...overrides,
  };
}

// Pointer on the bottom edge scrolls down at full speed; mid-viewport does not scroll.
const BOTTOM_EDGE_Y = 500;
const MID_Y = 250;

let frames: Map<number, FrameRequestCallback>;
let nextFrameId: number;
let requestFrame: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>;
let cancelFrame: ReturnType<typeof vi.fn<(id: number) => void>>;

/** Runs the frames pending right now; frames they schedule wait for the next call. */
function runFrame() {
  const pending = [...frames.entries()];
  frames.clear();
  for (const [, callback] of pending) callback(0);
}

describe('useTimelineAutoScroll', () => {
  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    requestFrame = vi.fn((callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    });
    cancelFrame = vi.fn((id: number) => {
      frames.delete(id);
    });
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not start a loop without a tracked pointer', () => {
    const autoScroll = renderHook(createContainer(), createGesture({ moveDragging: true }));

    autoScroll.checkAndTriggerAutoScroll();

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('does not start a loop without a dragging move or an active resize', () => {
    const autoScroll = renderHook(createContainer(), createGesture());

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('does not start a loop without a scroll container', () => {
    const autoScroll = renderHook(null, createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('does not start a loop away from the scroll edges', () => {
    const autoScroll = renderHook(createContainer(), createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, MID_Y);
    autoScroll.checkAndTriggerAutoScroll();

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('does not start a loop when there is no room left to scroll', () => {
    const autoScroll = renderHook(createContainer(1500), createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();

    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('schedules only one frame while one is pending', () => {
    const autoScroll = renderHook(createContainer(), createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    autoScroll.checkAndTriggerAutoScroll();

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
  });

  it('scrolls each frame by the clamped velocity and keeps going', () => {
    const container = createContainer(1490);
    const autoScroll = renderHook(container, createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    runFrame();

    // 1490 + 16 is clamped to the 1500 px maximum.
    expect(container.scrollTop).toBe(1500);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('scrolls by the full velocity when there is room', () => {
    const container = createContainer(500);
    const autoScroll = renderHook(container, createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    runFrame();
    expect(container.scrollTop).toBe(500 + AUTO_SCROLL_MAX_SPEED_PX);
    runFrame();
    expect(container.scrollTop).toBe(500 + 2 * AUTO_SCROLL_MAX_SPEED_PX);
  });

  it('re-applies an active resize at the pointer after scrolling', () => {
    const gesture = createGesture({ resizeActive: true });
    const autoScroll = renderHook(createContainer(), gesture);

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    runFrame();

    expect(gesture.applyResizeAt).toHaveBeenCalledWith(
      BOTTOM_EDGE_Y,
      500 + AUTO_SCROLL_MAX_SPEED_PX,
    );
    expect(gesture.applyMoveAt).not.toHaveBeenCalled();
  });

  it('re-applies a dragging move at the pointer when no resize is active', () => {
    const gesture = createGesture({ moveDragging: true });
    const autoScroll = renderHook(createContainer(), gesture);

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    runFrame();

    expect(gesture.applyMoveAt).toHaveBeenCalledWith(
      10,
      BOTTOM_EDGE_Y,
      500 + AUTO_SCROLL_MAX_SPEED_PX,
    );
    expect(gesture.applyResizeAt).not.toHaveBeenCalled();
  });

  it('gives resize priority when both gestures report active', () => {
    const gesture = createGesture({ moveDragging: true, resizeActive: true });
    const autoScroll = renderHook(createContainer(), gesture);

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    runFrame();

    expect(gesture.applyResizeAt).toHaveBeenCalledTimes(1);
    expect(gesture.applyMoveAt).not.toHaveBeenCalled();
  });

  it('stops the loop when the gesture ends', () => {
    const gesture = createGesture({ moveDragging: true });
    const container = createContainer();
    const autoScroll = renderHook(container, gesture);

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    runFrame();
    gesture.moveDragging = false;
    runFrame();

    expect(container.scrollTop).toBe(500 + AUTO_SCROLL_MAX_SPEED_PX);
    expect(frames.size).toBe(0);
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('stops the loop once the scroll top can no longer change', () => {
    const gesture = createGesture({ moveDragging: true });
    const container = createContainer(1490);
    const autoScroll = renderHook(container, gesture);

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    runFrame();
    runFrame();

    expect(container.scrollTop).toBe(1500);
    expect(gesture.applyMoveAt).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('cancels the pending frame on stopAutoScroll', () => {
    const autoScroll = renderHook(createContainer(), createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    autoScroll.stopAutoScroll();

    expect(cancelFrame).toHaveBeenCalledWith(1);
    expect(frames.size).toBe(0);

    // A fresh probe can start a new loop afterwards.
    autoScroll.checkAndTriggerAutoScroll();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('stops a running loop when the pointer leaves the edge', () => {
    const autoScroll = renderHook(createContainer(), createGesture({ moveDragging: true }));

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    autoScroll.trackPointer(10, MID_Y);
    autoScroll.checkAndTriggerAutoScroll();

    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });

  it('uses the tracked pointer for the probe', () => {
    const autoScroll = renderHook(createContainer(), createGesture({ moveDragging: true }));

    autoScroll.checkAndTriggerAutoScroll();
    expect(requestFrame).not.toHaveBeenCalled();

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  it('stops the loop after clearPointer', () => {
    const gesture = createGesture({ moveDragging: true });
    const container = createContainer();
    const autoScroll = renderHook(container, gesture);

    autoScroll.trackPointer(10, BOTTOM_EDGE_Y);
    autoScroll.checkAndTriggerAutoScroll();
    autoScroll.clearPointer();
    runFrame();

    expect(container.scrollTop).toBe(500);
    expect(gesture.applyMoveAt).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);

    autoScroll.checkAndTriggerAutoScroll();
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });
});
