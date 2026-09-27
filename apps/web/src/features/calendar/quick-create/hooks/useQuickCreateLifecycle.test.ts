import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuickCreateLifecycle } from './useQuickCreateLifecycle';

const { hooks } = vi.hoisted(() => {
  type Slot = {
    value?: unknown;
    deps?: readonly unknown[];
    cleanup?: () => void;
    set?: (next: unknown) => void;
  };
  const hooks = {
    slots: [] as Slot[],
    index: 0,
    effects: [] as Array<() => void>,
    reset() {
      for (const slot of this.slots) slot.cleanup?.();
      this.slots = [];
      this.index = 0;
      this.effects = [];
    },
    sameDeps(a?: readonly unknown[], b?: readonly unknown[]) {
      return !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    },
    state<T>(initial: T) {
      const index = this.index++;
      const slot = (this.slots[index] ??= { value: initial });
      slot.set ??= (next) => {
        slot.value = next;
      };
      return [slot.value as T, slot.set as (next: T) => void] as const;
    },
    callback<T>(value: T, deps: readonly unknown[]) {
      const index = this.index++;
      const previous = this.slots[index];
      if (this.sameDeps(previous?.deps, deps)) return previous?.value as T;
      this.slots[index] = { value, deps };
      return value;
    },
    effect(callback: () => void | (() => void), deps: readonly unknown[]) {
      const index = this.index++;
      const previous = this.slots[index];
      if (this.sameDeps(previous?.deps, deps)) return;
      previous?.cleanup?.();
      const slot: Slot = { deps };
      this.slots[index] = slot;
      this.effects.push(() => {
        const cleanup = callback();
        if (cleanup) slot.cleanup = cleanup;
      });
    },
    flush() {
      for (const effect of this.effects.splice(0)) effect();
    },
  };
  return { hooks };
});

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useState: <T>(initial: T) => hooks.state(initial),
    useCallback: <T>(callback: T, deps: readonly unknown[]) => hooks.callback(callback, deps),
    useEffect: (callback: () => void | (() => void), deps: readonly unknown[]) =>
      hooks.effect(callback, deps),
  };
});

type Options = Parameters<typeof useQuickCreateLifecycle>[0];
type KeyListener = (event: globalThis.KeyboardEvent) => void;

function LifecycleHarness(options: Options) {
  return useQuickCreateLifecycle(options);
}

function focusable() {
  return { focus: vi.fn() } as unknown as HTMLElement;
}

describe('useQuickCreateLifecycle', () => {
  let options: Options;
  let titleFocus: ReturnType<typeof vi.fn>;
  let addListener: ReturnType<typeof vi.fn>;
  let removeListener: ReturnType<typeof vi.fn>;
  let listeners: Map<string, KeyListener>;
  let focusables: HTMLElement[];
  let querySelectorAll: ReturnType<typeof vi.fn>;
  let activeElement: HTMLElement | null;

  const render = (overrides: Partial<Options> = {}) => {
    hooks.index = 0;
    const result = LifecycleHarness({ ...options, ...overrides });
    hooks.flush();
    return result;
  };

  const keydown = (key: string, shiftKey = false) => {
    const event = {
      key,
      shiftKey,
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as globalThis.KeyboardEvent;
    listeners.get('keydown')?.(event);
    return event;
  };

  beforeEach(() => {
    hooks.reset();
    vi.useFakeTimers();
    listeners = new Map();
    focusables = [];
    activeElement = null;
    titleFocus = vi.fn();
    querySelectorAll = vi.fn(() => focusables);
    addListener = vi.fn((type: string, listener: KeyListener) => listeners.set(type, listener));
    removeListener = vi.fn((type: string) => listeners.delete(type));
    vi.stubGlobal('window', { addEventListener: addListener, removeEventListener: removeListener });
    vi.stubGlobal('document', {
      get activeElement() {
        return activeElement;
      },
    });
    options = {
      isOpen: true,
      isSaving: false,
      isDeleteConfirmOpen: false,
      setIsDeleteConfirmOpen: vi.fn(),
      popoverRef: { current: { querySelectorAll } as unknown as HTMLDivElement },
      titleInputRef: { current: { focus: titleFocus } as unknown as HTMLInputElement },
      onClosing: vi.fn(),
      onClose: vi.fn(),
    };
  });

  afterEach(() => {
    hooks.reset();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('schedules autofocus at exactly 50ms with preventScroll', () => {
    render();
    vi.advanceTimersByTime(49);
    expect(titleFocus).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(titleFocus).toHaveBeenCalledOnce();
    expect(titleFocus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('cancels pending autofocus on close and effect cleanup', () => {
    render();
    render({ isOpen: false });
    vi.advanceTimersByTime(50);
    expect(titleFocus).not.toHaveBeenCalled();

    render();
    hooks.reset();
    vi.advanceTimersByTime(50);
    expect(titleFocus).not.toHaveBeenCalled();
  });

  it('schedules no autofocus while closed', () => {
    render({ isOpen: false });
    vi.advanceTimersByTime(50);
    expect(titleFocus).not.toHaveBeenCalled();
  });

  it('begins animated closing and calls onClosing without immediately calling onClose', () => {
    const lifecycle = render();
    lifecycle.handleRequestClose();
    expect(render().isClosing).toBe(true);
    expect(options.onClosing).toHaveBeenCalledOnce();
    expect(options.onClose).not.toHaveBeenCalled();
  });

  it('blocks request-close while saving or already closing', () => {
    render({ isSaving: true }).handleRequestClose();
    expect(render({ isSaving: true }).isClosing).toBe(false);
    expect(options.onClosing).not.toHaveBeenCalled();

    render().handleRequestClose();
    render().handleRequestClose();
    expect(options.onClosing).toHaveBeenCalledOnce();
  });

  it('ignores unrelated animation targets and animation end before closing', () => {
    const lifecycle = render();
    lifecycle.handleAnimationEnd({
      target: options.popoverRef.current,
    } as unknown as React.AnimationEvent);
    expect(options.onClose).not.toHaveBeenCalled();
    lifecycle.handleRequestClose();
    render().handleAnimationEnd({ target: {} } as React.AnimationEvent);
    expect(render().isClosing).toBe(true);
    expect(options.onClose).not.toHaveBeenCalled();
  });

  it('resets closing state before calling onClose for the popover animation target', () => {
    render().handleRequestClose();
    const lifecycle = render();
    vi.mocked(options.onClose).mockImplementation(() => {
      expect(hooks.slots.find((slot) => slot.set)?.value).toBe(false);
    });
    lifecycle.handleAnimationEnd({
      target: options.popoverRef.current,
    } as unknown as React.AnimationEvent);
    expect(options.onClose).toHaveBeenCalledOnce();
    expect(render().isClosing).toBe(false);
  });

  it('handles ordinary Escape through animated close, with stop but no prevent', () => {
    render();
    const event = keydown('Escape');
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(render().isClosing).toBe(true);
    expect(options.onClosing).toHaveBeenCalledOnce();
    expect(options.onClose).not.toHaveBeenCalled();
  });

  it('dismisses delete confirmation on Escape without closing the popover', () => {
    render({ isDeleteConfirmOpen: true });
    const event = keydown('Escape');
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.setIsDeleteConfirmOpen).toHaveBeenCalledWith(false);
    expect(render({ isDeleteConfirmOpen: true }).isClosing).toBe(false);
    expect(options.onClosing).not.toHaveBeenCalled();
  });

  it('ignores Escape while saving, including stop/prevent behavior', () => {
    render({ isSaving: true });
    const event = keydown('Escape');
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(options.onClosing).not.toHaveBeenCalled();
    expect(render({ isSaving: true }).isClosing).toBe(false);
  });

  it('wraps forward Tab from last to first using the exact selector, even while saving', () => {
    focusables = [focusable(), focusable(), focusable()];
    activeElement = focusables[2] ?? null;
    render({ isSaving: true });
    const event = keydown('Tab');
    expect(querySelectorAll).toHaveBeenCalledWith(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    );
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(focusables[0]?.focus).toHaveBeenCalledOnce();
  });

  it('wraps Shift+Tab from first to last', () => {
    focusables = [focusable(), focusable(), focusable()];
    activeElement = focusables[0] ?? null;
    render();
    const event = keydown('Tab', true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(focusables[2]?.focus).toHaveBeenCalledOnce();
  });

  it('does nothing for intermediate Tab or an active element outside the popover', () => {
    focusables = [focusable(), focusable(), focusable()];
    activeElement = focusables[1] ?? null;
    render();
    const middle = keydown('Tab');
    expect(middle.preventDefault).not.toHaveBeenCalled();
    activeElement = focusable();
    const outside = keydown('Tab');
    expect(outside.preventDefault).not.toHaveBeenCalled();
    expect(focusables[0]?.focus).not.toHaveBeenCalled();
    expect(focusables[2]?.focus).not.toHaveBeenCalled();
  });

  it('does nothing when no focusable elements exist', () => {
    render();
    const event = keydown('Tab');
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('registers and removes the same keydown listener in capture phase only while open', () => {
    render({ isOpen: false });
    expect(addListener).not.toHaveBeenCalled();
    render();
    expect(addListener).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    const listener = addListener.mock.calls[0]?.[1];
    render({ isOpen: false });
    expect(removeListener).toHaveBeenCalledWith('keydown', listener, true);
    expect(listeners.has('keydown')).toBe(false);
  });

  it('does not reset isClosing merely because isOpen changes', () => {
    render().handleRequestClose();
    expect(render({ isOpen: false }).isClosing).toBe(true);
  });
});
