import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuickCreatePosition } from './useQuickCreatePosition';
import type { EventOccurrence } from '../utils/calendar-occurrences';
import type { AnchorRect, PopoverPositionResult } from '../utils/popover-position';

const { hooks, calculatePosition } = vi.hoisted(() => {
  type Effect = () => void | (() => void);
  type Slot = { value?: unknown; deps?: readonly unknown[]; cleanup?: () => void };
  const hooks = {
    slots: [] as Slot[],
    index: 0,
    layout: [] as Array<() => void>,
    passive: [] as Array<() => void>,
    reset() {
      for (const slot of this.slots) slot.cleanup?.();
      this.slots = [];
      this.index = 0;
      this.layout = [];
      this.passive = [];
    },
    sameDeps(a?: readonly unknown[], b?: readonly unknown[]) {
      return (
        a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
      );
    },
    effect(callback: Effect, deps: readonly unknown[], layout: boolean) {
      const index = this.index++;
      const previous = this.slots[index];
      if (this.sameDeps(previous?.deps, deps)) return;
      previous?.cleanup?.();
      const slot: Slot = { deps };
      this.slots[index] = slot;
      (layout ? this.layout : this.passive).push(() => {
        const cleanup = callback();
        if (cleanup) slot.cleanup = cleanup;
      });
    },
    flush() {
      for (const effect of this.layout.splice(0)) effect();
      for (const effect of this.passive.splice(0)) effect();
    },
  };
  return { hooks, calculatePosition: vi.fn() };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = hooks.index++;
      const slot = (hooks.slots[index] ??= { value: initial });
      return [slot.value, (value: unknown) => (slot.value = value)];
    },
    useCallback: (callback: unknown, deps: readonly unknown[]) => {
      const index = hooks.index++;
      const previous = hooks.slots[index];
      if (hooks.sameDeps(previous?.deps, deps)) return previous?.value;
      hooks.slots[index] = { value: callback, deps };
      return callback;
    },
    useLayoutEffect: (callback: () => void | (() => void), deps: readonly unknown[]) =>
      hooks.effect(callback, deps, true),
    useEffect: (callback: () => void | (() => void), deps: readonly unknown[]) =>
      hooks.effect(callback, deps, false),
  };
});

vi.mock('../utils/popover-position', () => ({ calculatePopoverPosition: calculatePosition }));

const fallbackRect: AnchorRect = {
  top: 100,
  bottom: 150,
  left: 300,
  right: 400,
  width: 100,
  height: 50,
};
const normalResult: PopoverPositionResult = {
  top: 92,
  left: 408,
  placement: 'right',
  arrowTop: 31,
  arrowLeft: null,
  maxHeight: 360,
};
const popoverRef = { current: null } as React.RefObject<HTMLDivElement | null>;

function element(
  rect: AnchorRect,
  offsetWidth = 0,
  offsetHeight = 0,
  parentElement: HTMLElement | null = null,
) {
  return {
    dataset: {} as { occurrenceKey?: string },
    offsetWidth,
    offsetHeight,
    parentElement,
    getBoundingClientRect: vi.fn(() => rect),
  } as unknown as HTMLElement;
}

function useRun(overrides: Partial<Parameters<typeof useQuickCreatePosition>[0]> = {}) {
  hooks.index = 0;
  const rendered = useQuickCreatePosition({
    isOpen: true,
    anchorRect: fallbackRect,
    editingOccurrence: null,
    popoverRef,
    mode: 'event',
    errorMessage: null,
    ...overrides,
  });
  hooks.flush();
  return { rendered, coords: hooks.slots[0]?.value };
}

describe('useQuickCreatePosition', () => {
  let eventElements: HTMLElement[];
  let draftElement: HTMLElement | null;
  let windowListeners: Map<string, (event: Event) => void>;
  let documentListeners: Map<string, (event: Event) => void>;
  let addWindowListener: ReturnType<typeof vi.fn>;
  let removeWindowListener: ReturnType<typeof vi.fn>;
  let addDocumentListener: ReturnType<typeof vi.fn>;
  let removeDocumentListener: ReturnType<typeof vi.fn>;
  let frames: Array<() => void>;

  beforeEach(() => {
    hooks.reset();
    calculatePosition.mockReset().mockReturnValue(normalResult);
    popoverRef.current = null;
    eventElements = [];
    draftElement = null;
    windowListeners = new Map();
    documentListeners = new Map();
    frames = [];
    addWindowListener = vi.fn((type: string, listener: (event: Event) => void) =>
      windowListeners.set(type, listener),
    );
    removeWindowListener = vi.fn((type: string) => windowListeners.delete(type));
    addDocumentListener = vi.fn((type: string, listener: (event: Event) => void) =>
      documentListeners.set(type, listener),
    );
    removeDocumentListener = vi.fn((type: string) => documentListeners.delete(type));
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener: addWindowListener,
      removeEventListener: removeWindowListener,
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      cancelAnimationFrame: vi.fn(),
    });
    vi.stubGlobal('document', {
      querySelectorAll: vi.fn((selector: string) =>
        selector === '[data-occurrence-key]' ? eventElements : [],
      ),
      querySelector: vi.fn((selector: string) =>
        selector === '[data-quick-create-draft="true"]' ? draftElement : null,
      ),
      addEventListener: addDocumentListener,
      removeEventListener: removeDocumentListener,
    });
  });

  afterEach(() => {
    hooks.reset();
    vi.unstubAllGlobals();
  });

  it('starts centered and maps normal placement style, arrows, and maxHeight', () => {
    const { rendered, coords } = useRun();
    expect(rendered).toEqual({
      style: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
      placement: 'center',
      arrowTop: null,
      arrowLeft: null,
      maxHeight: null,
    });
    expect(coords).toEqual({
      style: { top: '92px', left: '408px', maxHeight: '360px' },
      placement: 'right',
      arrowTop: 31,
      arrowLeft: null,
      maxHeight: 360,
    });
    expect(calculatePosition).toHaveBeenCalledWith({
      anchorRect: fallbackRect,
      popoverWidth: 440,
      popoverHeight: 440,
      viewportWidth: 1200,
      viewportHeight: 800,
      gap: 8,
    });
  });

  it('uses only the matching edited occurrence geometry', () => {
    const other = element({ ...fallbackRect, left: 10, right: 110 });
    other.dataset.occurrenceKey = 'other';
    const matchRect = { ...fallbackRect, left: 700, right: 800 };
    const match = element(matchRect);
    match.dataset.occurrenceKey = 'target';
    eventElements = [other, match];
    useRun({ editingOccurrence: { key: 'target' } as EventOccurrence });
    expect(document.querySelectorAll).toHaveBeenCalledWith('[data-occurrence-key]');
    expect(other.getBoundingClientRect).not.toHaveBeenCalled();
    expect(calculatePosition).toHaveBeenCalledWith(
      expect.objectContaining({ anchorRect: matchRect }),
    );
  });

  it('uses draft layout dimensions over its transform-collapsed rect', () => {
    draftElement = element(
      { top: 120, bottom: 120, left: 250, right: 250, width: 0, height: 0 },
      100,
      70,
    );
    useRun();
    expect(document.querySelector).toHaveBeenCalledWith('[data-quick-create-draft="true"]');
    expect(calculatePosition).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorRect: { top: 120, bottom: 190, left: 250, right: 350, width: 100, height: 70 },
      }),
    );
  });

  it('falls back to the supplied anchorRect when no DOM anchor exists', () => {
    useRun({ editingOccurrence: { key: 'missing' } as EventOccurrence });
    expect(calculatePosition).toHaveBeenCalledWith(
      expect.objectContaining({ anchorRect: fallbackRect }),
    );
    hooks.reset();
    calculatePosition.mockClear();
    useRun();
    expect(calculatePosition).toHaveBeenCalledWith(
      expect.objectContaining({ anchorRect: fallbackRect }),
    );
  });

  it('maps bottom placement to the empty-style state', () => {
    calculatePosition.mockReturnValue({ ...normalResult, placement: 'bottom' });
    expect(useRun().coords).toEqual({
      style: {},
      placement: 'bottom',
      arrowTop: null,
      arrowLeft: null,
      maxHeight: null,
    });
  });

  it('repositions on resize, capturing scroll, mode and error changes, and cleans up listeners', () => {
    useRun();
    expect(addWindowListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    calculatePosition.mockClear();
    windowListeners.get('resize')?.(new Event('resize'));
    windowListeners.get('scroll')?.(new Event('scroll'));
    expect(calculatePosition).toHaveBeenCalledTimes(2);
    useRun({ mode: 'task' });
    useRun({ mode: 'task', errorMessage: 'Invalid title' });
    expect(calculatePosition).toHaveBeenCalledTimes(4);
    expect(addWindowListener).toHaveBeenCalledTimes(2);
    hooks.reset();
    expect(removeWindowListener).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    expect(windowListeners.size).toBe(0);
  });

  it('keeps anchor motion tracking wired through stable callbacks', () => {
    const movingAncestor = {
      parentElement: null,
      getAnimations: () => [
        {
          playState: 'running',
          effect: { getComputedTiming: () => ({ endTime: 180 }) },
        },
      ],
    } as unknown as HTMLElement;
    const anchor = element(fallbackRect, 0, 0, movingAncestor);
    draftElement = anchor;
    useRun();
    expect(documentListeners.has('animationstart')).toBe(true);
    expect(documentListeners.has('transitionrun')).toBe(true);
    expect(frames).toHaveLength(1);
    calculatePosition.mockClear();
    frames.shift()?.();
    expect(calculatePosition).toHaveBeenCalledTimes(1);
    useRun({ mode: 'task' });
    expect(addDocumentListener).toHaveBeenCalledTimes(2);
    hooks.reset();
    expect(removeDocumentListener).toHaveBeenCalledWith(
      'animationstart',
      expect.any(Function),
      true,
    );
  });
});
