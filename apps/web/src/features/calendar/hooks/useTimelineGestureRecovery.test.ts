import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventOccurrence } from './useCalendarWindow';
import {
  createEscapeKeyHandler,
  createWindowPointerFallback,
  type TimelineEscapeKeyDeps,
  type TimelineRecoveryHandlers,
} from './useTimelineGestureRecovery';
import type { TimelineActiveMove } from './useTimelineMove';
import type { TimelineActiveResize } from './useTimelineResize';

const occurrence = {
  key: 'evt-1::2026-09-15',
  event: { id: 'evt-1' },
} as unknown as EventOccurrence;
const interval = { startMinute: 540, endMinute: 600 };
const layout = { left: 0.5, width: 0.5 };

/** Every action and gesture function, logged in call order. */
let log: string[];

function logged<Args extends unknown[]>(name: string) {
  return vi.fn((..._args: Args) => {
    log.push(name);
  });
}

function captureTarget({ releaseFails = false } = {}) {
  return {
    releasePointerCapture: vi.fn(() => {
      log.push('releasePointerCapture');
      if (releaseFails) throw new Error('no release');
    }),
  };
}

function activeMove(
  overrides: Partial<TimelineActiveMove> = {},
  target = captureTarget(),
): TimelineActiveMove {
  return {
    status: 'dragging',
    occurrence,
    originalDateKey: '2026-09-15',
    currentDateKey: '2026-09-16',
    startY: 600,
    startX: 50,
    originalMinutes: interval,
    currentMinutes: { startMinute: 600, endMinute: 660 },
    originalLayout: layout,
    originalTiming: { start: 0, end: 1 },
    pointerId: 1,
    button: target as unknown as HTMLButtonElement,
    columnTop: 0,
    initialScrollTop: 40,
    targets: [],
    conflictCandidates: [],
    ...overrides,
  };
}

function activeResize(
  overrides: Partial<TimelineActiveResize> = {},
  target = captureTarget(),
): TimelineActiveResize {
  return {
    occurrence,
    dateKey: '2026-09-15',
    edge: 'end',
    originalMinutes: interval,
    currentMinutes: interval,
    originalTiming: { start: 0, end: 1 },
    pointerId: 1,
    handle: target as unknown as HTMLSpanElement,
    columnTop: 0,
    initialScrollTop: 30,
    targets: [],
    conflictCandidates: [],
    ...overrides,
  };
}

function pointer({ pointerId = 1, buttons = 1, clientX = 70, clientY = 640 } = {}): PointerEvent {
  return { pointerId, buttons, clientX, clientY } as PointerEvent;
}

function createHandlers(): TimelineRecoveryHandlers {
  return {
    applyMovePosition: logged('applyMovePosition'),
    applyResizePosition: logged('applyResizePosition'),
    checkAndTriggerAutoScroll: logged('checkAndTriggerAutoScroll'),
    finishMove: logged('finishMove'),
    finishResize: logged('finishResize'),
  };
}

describe('createWindowPointerFallback', () => {
  let scrollRef: { current: HTMLDivElement | null };
  let resizeRef: { current: TimelineActiveResize | null };
  let moveRef: { current: TimelineActiveMove | null };
  let moveHandlersRef: { current: TimelineRecoveryHandlers };
  let trackPointer: ReturnType<typeof logged>;

  function createFallback() {
    return createWindowPointerFallback({
      scrollRef,
      resizeRef,
      moveRef,
      moveHandlersRef,
      trackPointer,
    });
  }

  beforeEach(() => {
    log = [];
    scrollRef = { current: { scrollTop: 100 } as HTMLDivElement };
    resizeRef = { current: null };
    moveRef = { current: null };
    moveHandlersRef = { current: createHandlers() };
    trackPointer = logged('trackPointer');
  });

  describe('pointermove', () => {
    it('continues a resize with the matching pointer, then probes auto-scroll', () => {
      resizeRef.current = activeResize();
      moveRef.current = activeMove();

      createFallback().onWindowPointerMove(pointer());

      expect(log).toEqual(['trackPointer', 'applyResizePosition', 'checkAndTriggerAutoScroll']);
      expect(trackPointer).toHaveBeenCalledWith(70, 640);
      expect(moveHandlersRef.current.applyResizePosition).toHaveBeenCalledWith(640, 100);
    });

    it("falls back to the resize's initial scrollTop without a container", () => {
      resizeRef.current = activeResize();
      scrollRef.current = null;

      createFallback().onWindowPointerMove(pointer());

      expect(moveHandlersRef.current.applyResizePosition).toHaveBeenCalledWith(640, 30);
    });

    it('finishes a resize, not cancelled, when no button is held', () => {
      resizeRef.current = activeResize();
      const event = pointer({ buttons: 0 });

      createFallback().onWindowPointerMove(event);

      expect(log).toEqual(['finishResize']);
      expect(moveHandlersRef.current.finishResize).toHaveBeenCalledWith(event, false);
    });

    it('falls through from a resize on another pointer to a dragging move', () => {
      resizeRef.current = activeResize({ pointerId: 2 });
      moveRef.current = activeMove();

      createFallback().onWindowPointerMove(pointer());

      expect(log).toEqual(['trackPointer', 'applyMovePosition', 'checkAndTriggerAutoScroll']);
    });

    it('continues a dragging move, then probes auto-scroll', () => {
      moveRef.current = activeMove();

      createFallback().onWindowPointerMove(pointer());

      expect(log).toEqual(['trackPointer', 'applyMovePosition', 'checkAndTriggerAutoScroll']);
      expect(moveHandlersRef.current.applyMovePosition).toHaveBeenCalledWith(70, 640, 100);
    });

    it("falls back to the move's initial scrollTop without a container", () => {
      moveRef.current = activeMove();
      scrollRef.current = null;

      createFallback().onWindowPointerMove(pointer());

      expect(moveHandlersRef.current.applyMovePosition).toHaveBeenCalledWith(70, 640, 40);
    });

    it('finishes a dragging move, not cancelled, when no button is held', () => {
      moveRef.current = activeMove();
      const event = pointer({ buttons: 0 });

      createFallback().onWindowPointerMove(event);

      expect(log).toEqual(['finishMove']);
      expect(moveHandlersRef.current.finishMove).toHaveBeenCalledWith(event, false);
    });

    it('ignores a pending move', () => {
      moveRef.current = activeMove({ status: 'pending' });

      createFallback().onWindowPointerMove(pointer());
      createFallback().onWindowPointerMove(pointer({ buttons: 0 }));

      expect(log).toEqual([]);
    });

    it('ignores a move on another pointer', () => {
      moveRef.current = activeMove({ pointerId: 2 });

      createFallback().onWindowPointerMove(pointer());

      expect(log).toEqual([]);
    });

    it('does nothing without a gesture', () => {
      createFallback().onWindowPointerMove(pointer());

      expect(log).toEqual([]);
    });
  });

  describe('pointerup and pointercancel', () => {
    it('finishes a resize before a move on pointer-up', () => {
      resizeRef.current = activeResize();
      moveRef.current = activeMove();
      const event = pointer();

      createFallback().onWindowPointerUp(event);

      expect(log).toEqual(['finishResize']);
      expect(moveHandlersRef.current.finishResize).toHaveBeenCalledWith(event, false);
    });

    it('finishes a dragging move on pointer-up when no resize matches', () => {
      resizeRef.current = activeResize({ pointerId: 2 });
      moveRef.current = activeMove();
      const event = pointer();

      createFallback().onWindowPointerUp(event);

      expect(log).toEqual(['finishMove']);
      expect(moveHandlersRef.current.finishMove).toHaveBeenCalledWith(event, false);
    });

    it('cancels a resize before a move on pointer-cancel', () => {
      resizeRef.current = activeResize();
      moveRef.current = activeMove();
      const event = pointer();

      createFallback().onWindowPointerCancel(event);

      expect(log).toEqual(['finishResize']);
      expect(moveHandlersRef.current.finishResize).toHaveBeenCalledWith(event, true);
    });

    it('cancels a dragging move on pointer-cancel', () => {
      moveRef.current = activeMove();
      const event = pointer();

      createFallback().onWindowPointerCancel(event);

      expect(log).toEqual(['finishMove']);
      expect(moveHandlersRef.current.finishMove).toHaveBeenCalledWith(event, true);
    });

    it('ignores a pending move or another pointer', () => {
      const fallback = createFallback();
      moveRef.current = activeMove({ status: 'pending' });
      fallback.onWindowPointerUp(pointer());
      fallback.onWindowPointerCancel(pointer());

      moveRef.current = activeMove({ pointerId: 2 });
      fallback.onWindowPointerUp(pointer());
      fallback.onWindowPointerCancel(pointer());

      expect(log).toEqual([]);
    });
  });

  it('reads the gesture functions from moveHandlersRef when each event fires', () => {
    const fallback = createFallback();
    const first = moveHandlersRef.current;
    const latest = createHandlers();
    moveHandlersRef.current = latest;
    moveRef.current = activeMove();
    resizeRef.current = activeResize({ pointerId: 2 });

    fallback.onWindowPointerMove(pointer());
    fallback.onWindowPointerMove(pointer({ pointerId: 2 }));
    fallback.onWindowPointerUp(pointer());

    expect(latest.applyMovePosition).toHaveBeenCalledTimes(1);
    expect(latest.applyResizePosition).toHaveBeenCalledTimes(1);
    expect(latest.checkAndTriggerAutoScroll).toHaveBeenCalledTimes(2);
    expect(latest.finishMove).toHaveBeenCalledTimes(1);
    for (const fn of Object.values(first)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });
});

describe('createEscapeKeyHandler', () => {
  let deps: TimelineEscapeKeyDeps;
  let resizeRef: { current: TimelineActiveResize | null };
  let moveRef: { current: TimelineActiveMove | null };

  const escape = { key: 'Escape' } as KeyboardEvent;

  beforeEach(() => {
    log = [];
    resizeRef = { current: null };
    moveRef = { current: null };
    deps = {
      resizeRef,
      moveRef,
      setResizePreview: logged('setResizePreview'),
      setMovePreview: logged('setMovePreview'),
      setMagneticSnap: logged('setMagneticSnap'),
      setHasConflict: logged('setHasConflict'),
      setSnapDirection: logged('setSnapDirection'),
      showExitingGhost: logged('showExitingGhost'),
      suppressClick: logged<[string]>('suppressClick'),
      releaseSuppressedClickSoon: logged<[string]>('releaseSuppressedClickSoon'),
      stopAutoScroll: logged('stopAutoScroll'),
      clearPointer: logged('clearPointer'),
    };
  });

  it('ignores other keys', () => {
    moveRef.current = activeMove();

    createEscapeKeyHandler(deps)({ key: 'Enter' } as KeyboardEvent);

    expect(log).toEqual([]);
    expect(moveRef.current).not.toBeNull();
  });

  it('only stops auto-scroll and clears the pointer without a gesture', () => {
    createEscapeKeyHandler(deps)(escape);

    expect(log).toEqual(['stopAutoScroll', 'clearPointer']);
  });

  it('cancels a dragging move in order, before any resize', () => {
    const target = captureTarget();
    moveRef.current = activeMove({}, target);
    const resize = activeResize();
    resizeRef.current = resize;

    createEscapeKeyHandler(deps)(escape);

    expect(log).toEqual([
      'stopAutoScroll',
      'clearPointer',
      'releasePointerCapture',
      'setMovePreview',
      'setMagneticSnap',
      'setHasConflict',
      'setSnapDirection',
      'showExitingGhost',
      'suppressClick',
      'releaseSuppressedClickSoon',
    ]);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(moveRef.current).toBeNull();
    expect(resizeRef.current).toBe(resize);
    expect(deps.setMovePreview).toHaveBeenCalledWith(null);
    expect(deps.setMagneticSnap).toHaveBeenCalledWith(null);
    expect(deps.setHasConflict).toHaveBeenCalledWith(false);
    expect(deps.setSnapDirection).toHaveBeenCalledWith(null);
    expect(deps.showExitingGhost).toHaveBeenCalledWith({
      occurrence,
      dateKey: '2026-09-15',
      originalMinutes: interval,
      originalLayout: layout,
    });
    expect(deps.suppressClick).toHaveBeenCalledWith(occurrence.key);
    expect(deps.releaseSuppressedClickSoon).toHaveBeenCalledWith(occurrence.key);
  });

  it('clears the move ref before clearing its preview', () => {
    moveRef.current = activeMove();
    let refWhenCleared: TimelineActiveMove | null | undefined;
    vi.mocked(deps.setMovePreview).mockImplementation(() => {
      refWhenCleared = moveRef.current;
    });

    createEscapeKeyHandler(deps)(escape);

    expect(refWhenCleared).toBeNull();
  });

  it('ignores a pending move, even with no resize', () => {
    const pending = activeMove({ status: 'pending' });
    moveRef.current = pending;

    createEscapeKeyHandler(deps)(escape);

    expect(log).toEqual(['stopAutoScroll', 'clearPointer']);
    expect(moveRef.current).toBe(pending);
  });

  it('cancels a resize in order when no move is dragging', () => {
    const target = captureTarget();
    moveRef.current = activeMove({ status: 'pending' });
    resizeRef.current = activeResize({}, target);

    createEscapeKeyHandler(deps)(escape);

    expect(log).toEqual([
      'stopAutoScroll',
      'clearPointer',
      'releasePointerCapture',
      'setResizePreview',
      'setMagneticSnap',
      'setHasConflict',
      'suppressClick',
      'releaseSuppressedClickSoon',
    ]);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(resizeRef.current).toBeNull();
    expect(deps.setResizePreview).toHaveBeenCalledWith(null);
    expect(deps.suppressClick).toHaveBeenCalledWith(occurrence.key);
    expect(deps.releaseSuppressedClickSoon).toHaveBeenCalledWith(occurrence.key);
    expect(deps.showExitingGhost).not.toHaveBeenCalled();
    expect(deps.setSnapDirection).not.toHaveBeenCalled();
  });

  it('tolerates pointer-capture release failures', () => {
    moveRef.current = activeMove({}, captureTarget({ releaseFails: true }));
    const handleKeyDown = createEscapeKeyHandler(deps);

    expect(() => handleKeyDown(escape)).not.toThrow();
    expect(moveRef.current).toBeNull();
    expect(log).toContain('releaseSuppressedClickSoon');

    log = [];
    resizeRef.current = activeResize({}, captureTarget({ releaseFails: true }));

    expect(() => handleKeyDown(escape)).not.toThrow();
    expect(resizeRef.current).toBeNull();
    expect(log).toContain('releaseSuppressedClickSoon');
  });
});
