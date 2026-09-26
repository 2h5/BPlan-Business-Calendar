import type { PointerEvent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useTimelineSlotSelection,
  type TimelineSlotSelection,
  type UseTimelineSlotSelectionOptions,
} from './useTimelineSlotSelection';
import styles from '../components/CalendarView.module.css';

const hourHeight = 64;
const colRect = { top: 100, bottom: 100 + 24 * hourHeight, left: 300, right: 450, width: 150 };
const dateKey = '2026-09-15';

/**
 * Runs the hook once and hands back its handlers. The web tests have no DOM,
 * so state updates are not observable here; these tests cover what the
 * handlers do with refs, timers, pointer capture and `onSelectSlot`, reading
 * `dragSelection` as `null` from that single render.
 */
function renderHook(options: Partial<UseTimelineSlotSelectionOptions> = {}): TimelineSlotSelection {
  let result: TimelineSlotSelection | undefined;
  function Harness() {
    result = useTimelineSlotSelection({ hourHeight, defaultDurationMinutes: 60, ...options });
    return null;
  }
  renderToStaticMarkup(<Harness />);
  return result!;
}

function pointer({
  clientY,
  clientX = 350,
  button = 0,
  onEvent = false,
}: {
  clientY: number;
  clientX?: number;
  button?: number;
  onEvent?: boolean;
}) {
  const closest = vi.fn((selector: string) =>
    onEvent && selector === `.${styles.timelineEvent}` ? {} : null,
  );
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  const event = {
    target: { closest },
    button,
    clientX,
    clientY,
    pointerId: 7,
    currentTarget: {
      getBoundingClientRect: () => ({ ...colRect, height: 24 * hourHeight }),
      setPointerCapture,
      releasePointerCapture,
    },
  } as unknown as PointerEvent<HTMLDivElement>;
  return { event, closest, setPointerCapture, releasePointerCapture };
}

/** Client Y of a grid minute in the stub column. */
const yAt = (minute: number) => colRect.top + (minute / 60) * hourHeight;

describe('useTimelineSlotSelection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no drag selection', () => {
    expect(renderHook().dragSelection).toBeNull();
  });

  it('turns a quick click into a default-duration slot before the hold box can show', () => {
    const onSelectSlot = vi.fn();
    const slots = renderHook({ onSelectSlot });
    const down = pointer({ clientY: yAt(9 * 60 + 9) });
    const up = pointer({ clientY: yAt(9 * 60 + 9) + 3, clientX: 352 });

    slots.handleColumnPointerDown(down.event, dateKey);
    expect(down.setPointerCapture).toHaveBeenCalledWith(7);
    expect(vi.getTimerCount()).toBe(1);

    slots.handleColumnPointerUp(up.event, dateKey);

    expect(vi.getTimerCount()).toBe(0);
    expect(up.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onSelectSlot).toHaveBeenCalledWith({
      dateKey,
      startMinute: 540,
      endMinute: 600,
      anchorRect: { top: 676, bottom: 740, left: 300, right: 450, width: 150, height: 64 },
    });
  });

  it('clamps the default duration to the end of the day', () => {
    const onSelectSlot = vi.fn();
    const slots = renderHook({ onSelectSlot, defaultDurationMinutes: 90 });

    slots.handleColumnPointerDown(pointer({ clientY: yAt(23 * 60 + 55) }).event, dateKey);
    slots.handleColumnPointerUp(pointer({ clientY: yAt(23 * 60 + 55) }).event, dateKey);

    expect(onSelectSlot).toHaveBeenCalledWith(
      expect.objectContaining({ startMinute: 1425, endMinute: 1440 }),
    );
  });

  it('arms the hold box for the 180 ms delay while the press is held', () => {
    const slots = renderHook();

    slots.handleColumnPointerDown(pointer({ clientY: yAt(600) }).event, dateKey);
    vi.advanceTimersByTime(179);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores presses that start on an event or with a non-primary button', () => {
    const onSelectSlot = vi.fn();
    const slots = renderHook({ onSelectSlot });
    const onEvent = pointer({ clientY: yAt(600), onEvent: true });
    const rightClick = pointer({ clientY: yAt(600), button: 2 });

    slots.handleColumnPointerDown(onEvent.event, dateKey);
    slots.handleColumnPointerDown(rightClick.event, dateKey);
    slots.handleColumnPointerUp(pointer({ clientY: yAt(600) }).event, dateKey);

    expect(onEvent.closest).toHaveBeenCalledWith(`.${styles.timelineEvent}`);
    expect(onEvent.setPointerCapture).not.toHaveBeenCalled();
    expect(rightClick.setPointerCapture).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it('only finishes a selection on the column where it started', () => {
    const onSelectSlot = vi.fn();
    const slots = renderHook({ onSelectSlot });

    slots.handleColumnPointerDown(pointer({ clientY: yAt(600) }).event, dateKey);
    slots.handleColumnPointerUp(pointer({ clientY: yAt(600) }).event, '2026-09-16');
    expect(onSelectSlot).not.toHaveBeenCalled();

    slots.handleColumnPointerUp(pointer({ clientY: yAt(600) }).event, dateKey);
    expect(onSelectSlot).toHaveBeenCalledTimes(1);
  });

  it('cancels a press without selecting a slot', () => {
    const onSelectSlot = vi.fn();
    const slots = renderHook({ onSelectSlot });
    const cancel = pointer({ clientY: yAt(600) });

    slots.handleColumnPointerDown(pointer({ clientY: yAt(600) }).event, dateKey);
    slots.handleColumnPointerCancel(cancel.event, dateKey);
    slots.handleColumnPointerUp(pointer({ clientY: yAt(600) }).event, dateKey);

    expect(cancel.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(vi.getTimerCount()).toBe(0);
    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it('keeps working when pointer capture is unavailable', () => {
    const onSelectSlot = vi.fn();
    const slots = renderHook({ onSelectSlot });
    const down = pointer({ clientY: yAt(600) });
    const up = pointer({ clientY: yAt(600) });
    down.setPointerCapture.mockImplementation(() => {
      throw new Error('no capture');
    });
    up.releasePointerCapture.mockImplementation(() => {
      throw new Error('no capture');
    });

    slots.handleColumnPointerDown(down.event, dateKey);
    slots.handleColumnPointerUp(up.event, dateKey);

    expect(onSelectSlot).toHaveBeenCalledTimes(1);
  });
});
