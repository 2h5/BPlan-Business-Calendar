import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventOccurrence } from './useCalendarWindow';
import {
  useTimelineMove,
  type TimelineActiveMove,
  type UseTimelineMoveOptions,
} from './useTimelineMove';
import type { EventTiming } from '../components/TimelineView';
import type { MinuteInterval } from '../utils/event-resize';

const DAY_1 = '2026-09-15';
const DAY_2 = '2026-09-16';
const TIME_ZONE = 'UTC';
const HOUR_HEIGHT = 60; // 1 px per minute keeps pointer maths readable.
const NOW = Date.UTC(2026, 8, 20, 12);

const occurrence = {
  key: 'evt-1::2026-09-15',
  event: { id: 'evt-1', allDay: false, title: 'Moving' },
  start: Date.UTC(2026, 8, 15, 9),
  end: Date.UTC(2026, 8, 15, 10),
} as unknown as EventOccurrence;
const other = {
  key: 'evt-2::2026-09-16',
  event: { id: 'evt-2', allDay: false, title: 'Other' },
  start: Date.UTC(2026, 8, 16, 13),
  end: Date.UTC(2026, 8, 16, 14),
} as unknown as EventOccurrence;
const interval: MinuteInterval = { startMinute: 540, endMinute: 600 };
const layout = { left: 0.5, width: 0.5 };

type MoveHook = ReturnType<typeof useTimelineMove>;
type ColumnRect = { left: number; right: number; width: number };

/** Every feedback and auto-scroll action, logged in call order. */
let log: string[];
let options: UseTimelineMoveOptions;
let scrollRef: { current: HTMLDivElement | null };
let columnRects: Array<[string, ColumnRect]>;

function logged<Args extends unknown[]>(name: string) {
  return vi.fn((..._args: Args) => {
    log.push(name);
  });
}

function createOptions(overrides: Partial<UseTimelineMoveOptions> = {}) {
  return {
    dateKeys: [DAY_1, DAY_2],
    selectedDateKey: DAY_1,
    hourHeight: HOUR_HEIGHT,
    timeZone: TIME_ZONE,
    byDateKey: new Map([
      [DAY_1, [occurrence]],
      [DAY_2, [other]],
    ]),
    workingHours: undefined,
    timingOverrides: undefined,
    onMoveEvent: logged<[EventOccurrence, EventTiming]>('onMoveEvent'),
    setMagneticSnap: logged('setMagneticSnap'),
    setHasConflict: logged('setHasConflict'),
    setSnapDirection: logged('setSnapDirection'),
    clearSettle: logged('clearSettle'),
    clearExitingGhost: logged('clearExitingGhost'),
    showExitingGhost: logged('showExitingGhost'),
    suppressClick: logged<[string]>('suppressClick'),
    releaseSuppressedClickSoon: logged<[string]>('releaseSuppressedClickSoon'),
    triggerSettle: logged<[string]>('triggerSettle'),
    stopAutoScroll: logged('stopAutoScroll'),
    checkAndTriggerAutoScroll: logged('checkAndTriggerAutoScroll'),
    trackPointer: logged<[number, number]>('trackPointer'),
    clearPointer: logged('clearPointer'),
    ...overrides,
  } as UseTimelineMoveOptions;
}

/** A scroll container whose `[data-date-key]` columns report `columnRects`. */
function createContainer(scrollTop = 0) {
  return {
    scrollTop,
    querySelectorAll: vi.fn(() =>
      columnRects.map(([key, rect]) => ({
        getAttribute: () => key,
        getBoundingClientRect: () => rect,
      })),
    ),
  } as unknown as HTMLDivElement;
}

/**
 * Runs the hook once. The web tests have no DOM, so `movePreview` state is
 * not observable here; these tests cover `moveRef`, the button's pointer
 * capture and the actions and callbacks the handlers call.
 */
function renderHook(): MoveHook {
  let result: MoveHook | undefined;
  function Harness() {
    result = useTimelineMove(scrollRef, options);
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result!;
}

function createButton({ inColumn = true, captureFails = false, releaseFails = false } = {}) {
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
  button: ReturnType<typeof createButton>,
  { pointerId = 1, clientX = 50, clientY = 600, onResizeEdge = false, buttonId = 0 } = {},
) {
  return {
    button: buttonId,
    pointerId,
    clientX,
    clientY,
    currentTarget: button,
    target: { closest: vi.fn(() => (onResizeEdge ? {} : null)) },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent<HTMLButtonElement>;
}

function pressMove(
  move: MoveHook,
  { button = createButton(), dateKey = DAY_1, clientX = 50 } = {},
) {
  move.handleMovePointerDown(
    pointerEvent(button, { clientX }),
    occurrence,
    dateKey,
    interval,
    layout,
  );
  log.length = 0;
  return button;
}

/** Presses, then drags 60 px down in the same column so the move is dragging. */
function startDrag(move: MoveHook, button = createButton()) {
  pressMove(move, { button });
  move.handleMovePointerMove(pointerEvent(button, { clientY: 660 }));
  log.length = 0;
  return button;
}

describe('useTimelineMove', () => {
  beforeEach(() => {
    log = [];
    columnRects = [
      [DAY_1, { left: 0, right: 100, width: 100 }],
      [DAY_2, { left: 100, right: 200, width: 100 }],
    ];
    options = createOptions();
    scrollRef = { current: createContainer() };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('pointer-down', () => {
    it('ignores a non-primary button', () => {
      const move = renderHook();

      move.handleMovePointerDown(
        pointerEvent(createButton(), { buttonId: 2 }),
        occurrence,
        DAY_1,
        interval,
      );

      expect(move.moveRef.current).toBeNull();
      expect(log).toEqual([]);
    });

    it('ignores a press when moving is unavailable', () => {
      options = createOptions({ onMoveEvent: undefined });
      const move = renderHook();

      move.handleMovePointerDown(pointerEvent(createButton()), occurrence, DAY_1, interval);

      expect(move.moveRef.current).toBeNull();
      expect(log).toEqual([]);
    });

    it('ignores a press on a resize edge', () => {
      const move = renderHook();
      const event = pointerEvent(createButton(), { onResizeEdge: true });

      move.handleMovePointerDown(event, occurrence, DAY_1, interval);

      expect((event.target as HTMLElement).closest).toHaveBeenCalledWith('[data-resize-edge]');
      expect(move.moveRef.current).toBeNull();
      expect(log).toEqual([]);
    });

    it('ignores a button outside a date column', () => {
      const move = renderHook();
      const button = createButton({ inColumn: false });

      move.handleMovePointerDown(pointerEvent(button), occurrence, DAY_1, interval);

      expect(button.closest).toHaveBeenCalledWith('[data-date-key]');
      expect(move.moveRef.current).toBeNull();
      expect(log).toEqual([]);
    });

    it('arms a pending move, tracks the pointer and clears feedback without capturing', () => {
      scrollRef = { current: createContainer(25) };
      const move = renderHook();
      const button = createButton();
      const event = pointerEvent(button);

      move.handleMovePointerDown(event, occurrence, DAY_1, interval, layout);

      expect(move.moveRef.current).toEqual<TimelineActiveMove>({
        status: 'pending',
        occurrence,
        originalDateKey: DAY_1,
        currentDateKey: DAY_1,
        startY: 600,
        startX: 50,
        originalMinutes: interval,
        currentMinutes: interval,
        originalLayout: layout,
        originalTiming: { start: occurrence.start, end: occurrence.end },
        pointerId: 1,
        button: button as unknown as HTMLButtonElement,
        columnTop: 0,
        initialScrollTop: 25,
        targets: [],
        conflictCandidates: [],
      });
      expect(log).toEqual(['trackPointer', 'clearExitingGhost', 'setHasConflict']);
      expect(options.trackPointer).toHaveBeenCalledWith(50, 600);
      expect(options.setHasConflict).toHaveBeenCalledWith(false);
      expect(button.setPointerCapture).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('takes the original timing from an override and defaults layout and scroll', () => {
      const override = { start: Date.UTC(2026, 8, 15, 8), end: Date.UTC(2026, 8, 15, 9) };
      options = createOptions({ timingOverrides: new Map([['evt-1', override]]) });
      scrollRef = { current: null };
      const move = renderHook();

      move.handleMovePointerDown(pointerEvent(createButton()), occurrence, DAY_1, interval);

      expect(move.moveRef.current).toMatchObject({
        originalTiming: override,
        originalLayout: { left: 0, width: 1 },
        initialScrollTop: 0,
      });
    });
  });

  describe('promotion', () => {
    it('stays pending below the drag threshold', () => {
      const move = renderHook();
      const button = pressMove(move);
      const event = pointerEvent(button, { clientX: 53, clientY: 605 });

      move.handleMovePointerMove(event);

      expect(move.moveRef.current?.status).toBe('pending');
      expect(move.moveRef.current?.currentMinutes).toEqual(interval);
      expect(log).toEqual(['trackPointer']);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    });

    it('promotes to dragging past the threshold: settle cleared, click suppressed, then capture', () => {
      const move = renderHook();
      const button = pressMove(move);

      move.handleMovePointerMove(pointerEvent(button, { clientY: 660 }));

      expect(move.moveRef.current?.status).toBe('dragging');
      expect(log.slice(0, 4)).toEqual([
        'trackPointer',
        'clearSettle',
        'suppressClick',
        'setPointerCapture',
      ]);
      expect(options.suppressClick).toHaveBeenCalledWith(occurrence.key);
      expect(button.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('tolerates a pointer capture failure', () => {
      const move = renderHook();
      const button = pressMove(move, { button: createButton({ captureFails: true }) });

      expect(() =>
        move.handleMovePointerMove(pointerEvent(button, { clientY: 660 })),
      ).not.toThrow();
      expect(move.moveRef.current?.status).toBe('dragging');
      expect(move.moveRef.current?.currentMinutes).toEqual({ startMinute: 600, endMinute: 660 });
    });
  });

  describe('pointer-move', () => {
    it('ignores another pointer', () => {
      const move = renderHook();
      const button = pressMove(move);

      move.handleMovePointerMove(pointerEvent(button, { pointerId: 2, clientY: 660 }));

      expect(move.moveRef.current?.status).toBe('pending');
      expect(log).toEqual([]);
    });

    it('ignores a move with no active gesture', () => {
      const move = renderHook();

      move.handleMovePointerMove(pointerEvent(createButton(), { clientY: 660 }));

      expect(log).toEqual([]);
    });

    it('while dragging, updates the position, then prevents default and probes auto-scroll', () => {
      const move = renderHook();
      const button = startDrag(move);
      const event = pointerEvent(button, { clientY: 720 });

      move.handleMovePointerMove(event);

      expect(log).toEqual([
        'trackPointer',
        'setMagneticSnap',
        'setHasConflict',
        'checkAndTriggerAutoScroll',
      ]);
      expect(options.setMagneticSnap).toHaveBeenLastCalledWith(null);
      expect(options.setHasConflict).toHaveBeenLastCalledWith(false);
      expect(move.moveRef.current?.currentMinutes).toEqual({ startMinute: 660, endMinute: 720 });
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('adds the scroll since the press to the pointer position', () => {
      const move = renderHook();
      startDrag(move);

      move.applyMovePosition(50, 630, 30);

      expect(move.moveRef.current?.currentMinutes).toEqual({ startMinute: 600, endMinute: 660 });
    });
  });

  describe('target day', () => {
    it('picks the column under the pointer and nudges right with the current time', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const move = renderHook();
      startDrag(move);

      move.applyMovePosition(150, 660, 0);

      expect(move.moveRef.current?.currentDateKey).toBe(DAY_2);
      expect(options.setSnapDirection).toHaveBeenCalledWith({
        key: occurrence.key,
        direction: 'right',
        id: NOW,
      });
    });

    it('nudges left when moving to an earlier day', () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const move = renderHook();
      pressMove(move, { dateKey: DAY_2, clientX: 150 });

      move.applyMovePosition(50, 660, 0);

      expect(move.moveRef.current?.currentDateKey).toBe(DAY_1);
      expect(options.setSnapDirection).toHaveBeenCalledWith({
        key: occurrence.key,
        direction: 'left',
        id: NOW,
      });
    });

    it('recomputes magnetic targets and conflict candidates for the new day', () => {
      const move = renderHook();
      startDrag(move);
      expect(move.moveRef.current?.conflictCandidates).toEqual([]);

      // 9:00 moved 240 px down on the next day lands on the other event at 13:00.
      move.applyMovePosition(150, 840, 0);

      const active = move.moveRef.current!;
      expect(active.conflictCandidates).toEqual([
        { key: other.key, title: 'Other', startMinute: 780, endMinute: 840 },
      ]);
      expect(active.targets.map((target) => target.minute)).toEqual(
        expect.arrayContaining([780, 840]),
      );
      expect(log.indexOf('setSnapDirection')).toBeLessThan(log.indexOf('setMagneticSnap'));
      expect(options.setHasConflict).toHaveBeenLastCalledWith(true);
      expect(active.currentMinutes).toEqual({ startMinute: 780, endMinute: 840 });
    });

    it('falls back to the nearest column centre between columns', () => {
      columnRects = [
        [DAY_1, { left: 0, right: 100, width: 100 }],
        [DAY_2, { left: 150, right: 250, width: 100 }],
      ];
      const move = renderHook();
      startDrag(move);

      move.applyMovePosition(120, 660, 0);
      expect(move.moveRef.current?.currentDateKey).toBe(DAY_1);

      move.applyMovePosition(140, 660, 0);
      expect(move.moveRef.current?.currentDateKey).toBe(DAY_2);
    });

    it('ignores columns for dates outside the view', () => {
      columnRects = [
        ['2026-09-30', { left: 100, right: 200, width: 100 }],
        [DAY_1, { left: 0, right: 100, width: 100 }],
      ];
      const move = renderHook();
      startDrag(move);

      move.applyMovePosition(150, 660, 0);

      expect(move.moveRef.current?.currentDateKey).toBe(DAY_1);
      expect(options.setSnapDirection).not.toHaveBeenCalled();
    });

    it('keeps the current day when the columns have no layout', () => {
      columnRects = [
        [DAY_1, { left: 0, right: 0, width: 0 }],
        [DAY_2, { left: 0, right: 0, width: 0 }],
      ];
      const move = renderHook();
      startDrag(move);

      move.applyMovePosition(150, 660, 0);

      expect(move.moveRef.current?.currentDateKey).toBe(DAY_1);
      expect(options.setSnapDirection).not.toHaveBeenCalled();
    });

    it('keeps the current day when there are no columns', () => {
      columnRects = [];
      const move = renderHook();
      startDrag(move);

      move.applyMovePosition(150, 660, 0);

      expect(move.moveRef.current?.currentDateKey).toBe(DAY_1);
      expect(options.setSnapDirection).not.toHaveBeenCalled();
    });

    it('keeps the current day without a scroll container', () => {
      const move = renderHook();
      startDrag(move);
      scrollRef.current = null;

      move.applyMovePosition(150, 660, 0);

      expect(move.moveRef.current?.currentDateKey).toBe(DAY_1);
      expect(options.setSnapDirection).not.toHaveBeenCalled();
    });

    it('uses the only day in a single-day view without reading columns', () => {
      options = createOptions({ dateKeys: [DAY_1] });
      const move = renderHook();
      startDrag(move);

      move.applyMovePosition(150, 660, 0);

      expect(move.moveRef.current?.currentDateKey).toBe(DAY_1);
      expect(scrollRef.current?.querySelectorAll).not.toHaveBeenCalled();
      expect(options.setSnapDirection).not.toHaveBeenCalled();
    });
  });

  describe('finishing', () => {
    it('stops auto-scroll before ignoring another pointer', () => {
      const move = renderHook();
      const button = startDrag(move);

      move.handleMovePointerUp(pointerEvent(button, { pointerId: 2 }));

      expect(log).toEqual(['stopAutoScroll']);
      expect(move.moveRef.current?.status).toBe('dragging');
    });

    it('stops auto-scroll when no move is active', () => {
      const move = renderHook();

      move.finishMove(pointerEvent(createButton()), false);

      expect(log).toEqual(['stopAutoScroll']);
    });

    it('clears a pending move with no ghost, suppression or commit', () => {
      const move = renderHook();
      const button = pressMove(move);
      const event = pointerEvent(button);

      move.handleMovePointerUp(event);

      expect(move.moveRef.current).toBeNull();
      expect(log).toEqual([
        'stopAutoScroll',
        'releasePointerCapture',
        'clearPointer',
        'setMagneticSnap',
        'setHasConflict',
        'setSnapDirection',
      ]);
      expect(options.setMagneticSnap).toHaveBeenLastCalledWith(null);
      expect(options.setHasConflict).toHaveBeenLastCalledWith(false);
      expect(options.setSnapDirection).toHaveBeenLastCalledWith(null);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('clears the move ref before clearing the tracked pointer', () => {
      const move = renderHook();
      const button = startDrag(move);
      let refWhenCleared: TimelineActiveMove | null | undefined;
      vi.mocked(options.clearPointer).mockImplementation(() => {
        refWhenCleared = move.moveRef.current;
      });

      move.handleMovePointerUp(pointerEvent(button, { clientY: 660 }));

      expect(refWhenCleared).toBeNull();
    });

    it('commits a dragged move: ghost, suppression, settle, then the move', () => {
      const move = renderHook();
      const button = startDrag(move);
      const event = pointerEvent(button, { clientY: 660 });

      move.handleMovePointerUp(event);

      expect(log).toEqual([
        'stopAutoScroll',
        'releasePointerCapture',
        'clearPointer',
        'setMagneticSnap',
        'setHasConflict',
        'setSnapDirection',
        'showExitingGhost',
        'suppressClick',
        'releaseSuppressedClickSoon',
        'triggerSettle',
        'onMoveEvent',
      ]);
      expect(options.showExitingGhost).toHaveBeenCalledWith({
        occurrence,
        dateKey: DAY_1,
        originalMinutes: interval,
        originalLayout: layout,
      });
      expect(options.suppressClick).toHaveBeenLastCalledWith(occurrence.key);
      expect(options.releaseSuppressedClickSoon).toHaveBeenCalledWith(occurrence.key);
      expect(options.triggerSettle).toHaveBeenCalledWith(occurrence.key);
      expect(options.onMoveEvent).toHaveBeenCalledWith(occurrence, {
        start: Date.UTC(2026, 8, 15, 10),
        end: Date.UTC(2026, 8, 15, 11),
      });
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(button.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(move.moveRef.current).toBeNull();
    });

    it('commits the timing on the target day of a cross-day move', () => {
      const move = renderHook();
      const button = startDrag(move);
      move.handleMovePointerMove(pointerEvent(button, { clientX: 150, clientY: 660 }));

      move.handleMovePointerUp(pointerEvent(button, { clientX: 150, clientY: 660 }));

      expect(options.showExitingGhost).toHaveBeenCalledWith(
        expect.objectContaining({ dateKey: DAY_1 }),
      );
      expect(options.onMoveEvent).toHaveBeenCalledWith(occurrence, {
        start: Date.UTC(2026, 8, 16, 10),
        end: Date.UTC(2026, 8, 16, 11),
      });
    });

    it('does not commit a cancelled move but still shows the ghost and suppresses the click', () => {
      const move = renderHook();
      const button = startDrag(move);

      move.handleMovePointerCancel(pointerEvent(button, { clientY: 660 }));

      expect(log).toContain('showExitingGhost');
      expect(log).toContain('releaseSuppressedClickSoon');
      expect(options.triggerSettle).not.toHaveBeenCalled();
      expect(options.onMoveEvent).not.toHaveBeenCalled();
      expect(move.moveRef.current).toBeNull();
    });

    it('does not commit an unchanged timing', () => {
      const move = renderHook();
      const button = pressMove(move);
      // Horizontal only: past the threshold, but zero minutes of movement.
      move.handleMovePointerMove(pointerEvent(button, { clientX: 60 }));
      expect(move.moveRef.current?.status).toBe('dragging');

      move.handleMovePointerUp(pointerEvent(button, { clientX: 60 }));

      expect(log).toContain('showExitingGhost');
      expect(options.triggerSettle).not.toHaveBeenCalled();
      expect(options.onMoveEvent).not.toHaveBeenCalled();
    });

    it('accepts a window pointer event without preventDefault', () => {
      const move = renderHook();
      const button = startDrag(move);
      const windowEvent = { pointerId: 1, clientX: 50, clientY: 660 } as PointerEvent;

      expect(() => move.finishMove(windowEvent, false)).not.toThrow();
      expect(options.onMoveEvent).toHaveBeenCalledWith(occurrence, {
        start: Date.UTC(2026, 8, 15, 10),
        end: Date.UTC(2026, 8, 15, 11),
      });
      expect(button.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('tolerates a pointer release failure', () => {
      const move = renderHook();
      const button = startDrag(move, createButton({ releaseFails: true }));

      expect(() => move.handleMovePointerUp(pointerEvent(button, { clientY: 660 }))).not.toThrow();
      expect(move.moveRef.current).toBeNull();
      expect(options.onMoveEvent).toHaveBeenCalled();
    });
  });
});
