import { describe, expect, it } from 'vitest';

import {
  clickSlotRange,
  dragSlotRange,
  hasSlotDragStarted,
  holdSlotRange,
  isSlotClick,
  SLOT_HOLD_DELAY_MS,
  slotAnchorRect,
  snapSlotStart,
  snapToSlot,
} from './slot-selection';
import { formatMinute } from './timeline-format';

describe('Calendar slot selection & drag calculations', () => {
  it('snaps arbitrary minutes to 15-minute intervals', () => {
    expect(snapToSlot(0)).toBe(0);
    expect(snapToSlot(14)).toBe(0);
    expect(snapToSlot(15)).toBe(15);
    expect(snapToSlot(29)).toBe(15);
    expect(snapToSlot(30)).toBe(30);
    expect(snapToSlot(44)).toBe(30);
    expect(snapToSlot(45)).toBe(45);
    expect(snapToSlot(59)).toBe(45);
    expect(snapToSlot(600)).toBe(600); // 10:00
    expect(snapToSlot(612)).toBe(600); // 10:12 -> 10:00
    expect(snapToSlot(618)).toBe(615); // 10:18 -> 10:15
  });

  it('clamps minutes to day boundaries [0, 1440]', () => {
    expect(snapToSlot(-10)).toBe(0);
    expect(snapToSlot(1500)).toBe(1440);
  });

  it('starts a press on a 15-minute slot that still fits in the day', () => {
    expect(snapSlotStart(-10)).toBe(0);
    expect(snapSlotStart(612)).toBe(600);
    expect(snapSlotStart(1430)).toBe(1425); // 23:50 -> 23:45
    expect(snapSlotStart(1440)).toBe(1425); // bottom edge -> 23:45
  });

  it('shows a 15-minute box for a held press', () => {
    expect(holdSlotRange(600)).toEqual({ startMinute: 600, endMinute: 615 });
    expect(holdSlotRange(1425)).toEqual({ startMinute: 1425, endMinute: 1440 });
  });

  it('computes drag range downwards correctly', () => {
    // User clicks at 10:00 (minute 600) and drags down to 11:30 (minute 690)
    const range = dragSlotRange(600, 690);
    expect(range.startMinute).toBe(600); // 10:00
    expect(range.endMinute).toBe(705); // 11:45 (inclusive of 15m slot at 11:30)
  });

  it('computes drag range upwards correctly (invert direction)', () => {
    // User clicks at 14:00 (minute 840) and drags upwards to 12:30 (minute 750)
    const range = dragSlotRange(840, 750);
    expect(range.startMinute).toBe(750); // 12:30
    expect(range.endMinute).toBe(855); // 14:15 (inclusive of 15m slot at 14:00)
  });

  it('clamps a drag range to the end of the day', () => {
    expect(dragSlotRange(1380, 1440)).toEqual({ startMinute: 1380, endMinute: 1440 });
    expect(dragSlotRange(1425, 1439)).toEqual({ startMinute: 1425, endMinute: 1440 });
  });

  it('selects the default duration on click, clamped to 24:00', () => {
    expect(clickSlotRange(600, 60)).toEqual({ startMinute: 600, endMinute: 660 });
    expect(clickSlotRange(600, 30)).toEqual({ startMinute: 600, endMinute: 630 });
    expect(clickSlotRange(1410, 60)).toEqual({ startMinute: 1410, endMinute: 1440 });
  });

  it('formats minute values in 12h and 23h cycles', () => {
    expect(formatMinute(0, 'h23')).toBe('00:00');
    expect(formatMinute(0, 'h12')).toBe('12:00 AM');
    expect(formatMinute(570, 'h23')).toBe('09:30');
    expect(formatMinute(570, 'h12')).toBe('9:30 AM');
    expect(formatMinute(720, 'h12')).toBe('12:00 PM');
    expect(formatMinute(870, 'h12')).toBe('2:30 PM');
    expect(formatMinute(1440, 'h23')).toBe('24:00');
  });

  it('anchors the popover to the selected range across the column', () => {
    const colRect = { top: 100, left: 300, right: 450, width: 150 };

    expect(slotAnchorRect(colRect, { startMinute: 540, endMinute: 600 }, 64)).toEqual({
      top: 676,
      bottom: 740,
      left: 300,
      right: 450,
      width: 150,
      height: 64,
    });
    // A 15-minute slot is still at least 20 px tall.
    expect(slotAnchorRect(colRect, { startMinute: 540, endMinute: 555 }, 54)).toMatchObject({
      top: 586,
      height: 20,
      bottom: 606,
    });
  });

  it('shows the hold box only after the hold delay', () => {
    expect(SLOT_HOLD_DELAY_MS).toBe(180);
  });

  it('distinguishes click from drag based on movement threshold', () => {
    // Micro-jitter during a normal click
    expect(isSlotClick(2, 3)).toBe(true);
    expect(hasSlotDragStarted(2, 3)).toBe(false);
    // Deliberate vertical drag
    expect(isSlotClick(0, 15)).toBe(false);
    expect(hasSlotDragStarted(0, 15)).toBe(true);
    // Deliberate horizontal movement
    expect(isSlotClick(10, 0)).toBe(false);
    expect(hasSlotDragStarted(10, 0)).toBe(true);
    // Exactly 6 px is a drag
    expect(isSlotClick(6, 0)).toBe(false);
    expect(hasSlotDragStarted(0, 6)).toBe(true);
  });
});
