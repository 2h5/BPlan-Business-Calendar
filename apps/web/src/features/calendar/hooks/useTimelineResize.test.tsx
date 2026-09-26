import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventOccurrence } from './useCalendarWindow';
import {
  useTimelineResize,
  type TimelineActiveResize,
  type UseTimelineResizeOptions,
} from './useTimelineResize';
import type { EventTiming } from '../components/TimelineView';
import { dateMinuteToInstant, type MinuteInterval } from '../utils/event-resize';

const DATE_KEY = '2026-09-15';
const TIME_ZONE = 'UTC';
const HOUR_HEIGHT = 60; // 1 px per minute keeps pointer maths readable.

const occurrence = {
  key: 'evt-1::2026-09-15',
  event: { id: 'evt-1' },
  start: Date.UTC(2026, 8, 15, 9),
  end: Date.UTC(2026, 8, 15, 10),
} as unknown as EventOccurrence;
const interval: MinuteInterval = { startMinute: 540, endMinute: 600 };

type ResizeHook = ReturnType<typeof useTimelineResize>;
type PointerDownEvent = React.PointerEvent<HTMLSpanElement>;

/** Every feedback and auto-scroll action, logged in call order. */
let log: string[];
let options: UseTimelineResizeOptions;
let scrollRef: { current: HTMLDivElement | null };

function logged<Args extends unknown[]>(name: string) {
  return vi.fn((..._args: Args) => {
    log.push(name);
  });
}

function createOptions(overrides: Partial<UseTimelineResizeOptions> = {}) {
  return {
    hourHeight: HOUR_HEIGHT,
    timeZone: TIME_ZONE,
    byDateKey: new Map([[DATE_KEY, [occurrence]]]),
    workingHours: undefined,
    timingOverrides: undefined,
    onResizeEvent: logged<[EventOccurrence, EventTiming]>('onResizeEvent'),
    setMagneticSnap: logged('setMagneticSnap'),
    setHasConflict: logged('setHasConflict'),
    clearSettle: logged('clearSettle'),
    clearExitingGhost: logged('clearExitingGhost'),
    suppressClick: logged<[string]>('suppressClick'),
    releaseSuppressedClickSoon: logged<[string]>('releaseSuppressedClickSoon'),
    triggerSettle: logged<[string]>('triggerSettle'),
    stopAutoScroll: logged('stopAutoScroll'),
    checkAndTriggerAutoScroll: logged('checkAndTriggerAutoScroll'),
    trackPointer: logged<[number, number]>('trackPointer'),
    clearPointer: logged('clearPointer'),
    ...overrides,
  } as UseTimelineResizeOptions;
}

/**
 * Runs the hook once. The web tests have no DOM, so `resizePreview` state is
 * not observable here; these tests cover `resizeRef`, the handle's pointer
 * capture and the actions and callbacks the handlers call.
 */
function renderHook(): ResizeHook {
  let result: ResizeHook | undefined;
  function Harness() {
    result = useTimelineResize(scrollRef, options);
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result!;
}

function createHandle({ inColumn = true, captureFails = false, releaseFails = false } = {}) {
  const column = { getBoundingClientRect: () => ({ top: 0 }) };
  return {
    closest: vi.fn(() => (inColumn ? column : null)),
    setPointerCapture: vi.fn(() => {
      log.push('setPointerCapture');
      if (captureFails) throw new Error('no capture');
    }),
    releasePointerCapture: vi.fn(() => {
      log.push('releasePointerCapture');
      if (releaseFails) throw new Error('no release');
    }),
  };
}

function pointerEvent(
  handle: ReturnType<typeof createHandle>,
  { button = 0, pointerId = 1, clientX = 10, clientY = 600 } = {},
) {
  return {
    button,
    pointerId,
    clientX,
    clientY,
    currentTarget: handle,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerDownEvent;
}

function startResize(resize: ResizeHook, handle = createHandle()) {
  resize.handleResizePointerDown(pointerEvent(handle), occurrence, DATE_KEY, 'end', interval);
  log.length = 0;
  return handle;
}

describe('useTimelineResize', () => {
  beforeEach(() => {
    log = [];
    options = createOptions();
    scrollRef = { current: { scrollTop: 0 } as HTMLDivElement };
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('pointer-down', () => {
    it('ignores a non-primary button', () => {
      const resize = renderHook();
      const handle = createHandle();

      resize.handleResizePointerDown(
        pointerEvent(handle, { button: 2 }),
        occurrence,
        DATE_KEY,
        'end',
        interval,
      );

      expect(resize.resizeRef.current).toBeNull();
      expect(log).toEqual([]);
    });

    it('ignores the gesture without onResizeEvent', () => {
      options = createOptions({ onResizeEvent: undefined });
      const resize = renderHook();

      resize.handleResizePointerDown(
        pointerEvent(createHandle()),
        occurrence,
        DATE_KEY,
        'end',
        interval,
      );

      expect(resize.resizeRef.current).toBeNull();
      expect(log).toEqual([]);
    });

    it('ignores a handle outside a day column', () => {
      const resize = renderHook();
      const handle = createHandle({ inColumn: false });
      const event = pointerEvent(handle);

      resize.handleResizePointerDown(event, occurrence, DATE_KEY, 'end', interval);

      expect(handle.closest).toHaveBeenCalledWith('[data-date-key]');
      expect(resize.resizeRef.current).toBeNull();
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(log).toEqual([]);
    });

    it('arms the active resize from the pointer, column and scroll position', () => {
      scrollRef.current = { scrollTop: 120 } as HTMLDivElement;
      const resize = renderHook();
      const handle = createHandle();
      const event = pointerEvent(handle, { pointerId: 7 });

      resize.handleResizePointerDown(event, occurrence, DATE_KEY, 'start', interval);

      const active = resize.resizeRef.current as TimelineActiveResize;
      expect(active).toMatchObject({
        occurrence,
        dateKey: DATE_KEY,
        edge: 'start',
        originalMinutes: interval,
        currentMinutes: interval,
        originalTiming: { start: occurrence.start, end: occurrence.end },
        pointerId: 7,
        handle,
        columnTop: 0,
        initialScrollTop: 120,
      });
      expect(Array.isArray(active.targets)).toBe(true);
      expect(Array.isArray(active.conflictCandidates)).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('takes the original timing from a timing override', () => {
      const override = { start: Date.UTC(2026, 8, 15, 11), end: Date.UTC(2026, 8, 15, 12) };
      options = createOptions({ timingOverrides: new Map([['evt-1', override]]) });
      const resize = renderHook();

      resize.handleResizePointerDown(
        pointerEvent(createHandle()),
        occurrence,
        DATE_KEY,
        'end',
        interval,
      );

      expect(resize.resizeRef.current?.originalTiming).toBe(override);
    });

    it('falls back to a zero scroll top without a scroll container', () => {
      scrollRef.current = null;
      const resize = renderHook();

      resize.handleResizePointerDown(
        pointerEvent(createHandle()),
        occurrence,
        DATE_KEY,
        'end',
        interval,
      );

      expect(resize.resizeRef.current?.initialScrollTop).toBe(0);
    });

    it('tracks the pointer and runs the feedback actions in order, then captures', () => {
      const resize = renderHook();
      const handle = createHandle();

      resize.handleResizePointerDown(
        pointerEvent(handle, { pointerId: 3, clientX: 12, clientY: 580 }),
        occurrence,
        DATE_KEY,
        'end',
        interval,
      );

      expect(options.trackPointer).toHaveBeenCalledWith(12, 580);
      expect(options.suppressClick).toHaveBeenCalledWith(occurrence.key);
      expect(options.setMagneticSnap).toHaveBeenCalledWith(null);
      expect(options.setHasConflict).toHaveBeenCalledWith(false);
      expect(handle.setPointerCapture).toHaveBeenCalledWith(3);
      // setResizePreview runs between suppressClick and setMagneticSnap (not observable here).
      expect(log).toEqual([
        'trackPointer',
        'clearSettle',
        'clearExitingGhost',
        'suppressClick',
        'setMagneticSnap',
        'setHasConflict',
        'setPointerCapture',
      ]);
    });

    it('tolerates a failed pointer capture', () => {
      const resize = renderHook();
      const handle = createHandle({ captureFails: true });

      expect(() =>
        resize.handleResizePointerDown(pointerEvent(handle), occurrence, DATE_KEY, 'end', interval),
      ).not.toThrow();
      expect(resize.resizeRef.current).not.toBeNull();
    });
  });

  describe('pointer-move', () => {
    it('ignores another pointer', () => {
      const resize = renderHook();
      startResize(resize);
      const event = pointerEvent(createHandle(), { pointerId: 2, clientY: 700 });

      resize.handleResizePointerMove(event);

      expect(log).toEqual([]);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(resize.resizeRef.current?.currentMinutes).toEqual(interval);
    });

    it('ignores a move with no active resize', () => {
      const resize = renderHook();

      resize.handleResizePointerMove(pointerEvent(createHandle()));

      expect(log).toEqual([]);
    });

    it('tracks the pointer, re-applies the resize, then probes auto-scroll', () => {
      scrollRef.current = { scrollTop: 0 } as HTMLDivElement;
      const resize = renderHook();
      startResize(resize);
      const event = pointerEvent(createHandle(), { clientX: 14, clientY: 660 });

      resize.handleResizePointerMove(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(options.trackPointer).toHaveBeenCalledWith(14, 660);
      expect(log).toEqual([
        'trackPointer',
        'setMagneticSnap',
        'setHasConflict',
        'checkAndTriggerAutoScroll',
      ]);
      expect(resize.resizeRef.current?.currentMinutes).toEqual({
        startMinute: 540,
        endMinute: 660,
      });
    });

    it('adds the scroll since pointer-down to the pointer position', () => {
      const container = { scrollTop: 0 } as HTMLDivElement;
      scrollRef.current = container;
      const resize = renderHook();
      startResize(resize);
      container.scrollTop = 60;

      resize.handleResizePointerMove(pointerEvent(createHandle(), { clientY: 600 }));

      expect(resize.resizeRef.current?.currentMinutes).toEqual({
        startMinute: 540,
        endMinute: 660,
      });
    });
  });

  describe('finish', () => {
    it('stops auto-scroll first, even for another pointer, and otherwise ignores it', () => {
      const resize = renderHook();
      const handle = startResize(resize);
      const event = pointerEvent(handle, { pointerId: 2 });

      resize.finishResize(event, false);

      expect(log).toEqual(['stopAutoScroll']);
      expect(resize.resizeRef.current).not.toBeNull();
      expect(handle.releasePointerCapture).not.toHaveBeenCalled();
    });

    it('stops auto-scroll, releases capture, clears the resize and pointer, then feedback', () => {
      const resize = renderHook();
      const handle = startResize(resize);
      let resizeWhenPointerCleared: unknown = 'unset';
      vi.mocked(options.clearPointer).mockImplementation(() => {
        log.push('clearPointer');
        resizeWhenPointerCleared = resize.resizeRef.current;
      });
      const event = pointerEvent(handle);

      resize.finishResize(event, true);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(resize.resizeRef.current).toBeNull();
      expect(resizeWhenPointerCleared).toBeNull();
      // setResizePreview(null) runs between clearPointer and setMagneticSnap (not observable here).
      expect(log).toEqual([
        'stopAutoScroll',
        'releasePointerCapture',
        'clearPointer',
        'setMagneticSnap',
        'setHasConflict',
        'releaseSuppressedClickSoon',
      ]);
      expect(options.setMagneticSnap).toHaveBeenLastCalledWith(null);
      expect(options.setHasConflict).toHaveBeenLastCalledWith(false);
      expect(options.releaseSuppressedClickSoon).toHaveBeenCalledWith(occurrence.key);
    });

    it('does not commit a cancelled resize', () => {
      const resize = renderHook();
      const handle = startResize(resize);
      resize.handleResizePointerMove(pointerEvent(handle, { clientY: 660 }));

      resize.finishResize(pointerEvent(handle), true);

      expect(options.triggerSettle).not.toHaveBeenCalled();
      expect(options.onResizeEvent).not.toHaveBeenCalled();
    });

    it('does not commit unchanged timing', () => {
      const resize = renderHook();
      const handle = startResize(resize);

      resize.finishResize(pointerEvent(handle), false);

      expect(options.releaseSuppressedClickSoon).toHaveBeenCalledWith(occurrence.key);
      expect(options.triggerSettle).not.toHaveBeenCalled();
      expect(options.onResizeEvent).not.toHaveBeenCalled();
    });

    it('settles and commits the current snapped interval', () => {
      const resize = renderHook();
      const handle = startResize(resize);
      resize.handleResizePointerMove(pointerEvent(handle, { clientY: 667 }));
      const committed = resize.resizeRef.current!.currentMinutes;
      log.length = 0;

      resize.finishResize(pointerEvent(handle), false);

      const expected = {
        start: dateMinuteToInstant(DATE_KEY, committed.startMinute, TIME_ZONE)!.getTime(),
        end: dateMinuteToInstant(DATE_KEY, committed.endMinute, TIME_ZONE)!.getTime(),
      };
      expect(committed).toEqual({ startMinute: 540, endMinute: 660 });
      expect(expected).toEqual({
        start: Date.UTC(2026, 8, 15, 9),
        end: Date.UTC(2026, 8, 15, 11),
      });
      expect(options.triggerSettle).toHaveBeenCalledWith(occurrence.key);
      expect(options.onResizeEvent).toHaveBeenCalledWith(occurrence, expected);
      expect(log.slice(-2)).toEqual(['triggerSettle', 'onResizeEvent']);
    });

    it('tolerates a failed pointer release', () => {
      const resize = renderHook();
      const handle = startResize(resize, createHandle({ releaseFails: true }));
      resize.handleResizePointerMove(pointerEvent(handle, { clientY: 660 }));

      expect(() => resize.finishResize(pointerEvent(handle), false)).not.toThrow();
      expect(resize.resizeRef.current).toBeNull();
      expect(options.onResizeEvent).toHaveBeenCalledTimes(1);
    });
  });
});
