import type { AnchorRect } from './popover-position';

/** How long a press must be held before the 15-minute selection box shows. */
export const SLOT_HOLD_DELAY_MS = 180;

/** A minute range selected on a timed day column. */
export interface SlotRange {
  startMinute: number;
  endMinute: number;
}

/**
 * Grid minute where a press starts a selection: floored to a 15-minute slot
 * and kept within the day so the slot it starts still fits (last is 23:45).
 */
export function snapSlotStart(rawMinute: number): number {
  return Math.max(0, Math.min(23 * 60 + 45, Math.floor(rawMinute / 15) * 15));
}

/** Grid minute under a dragging pointer, floored to a 15-minute slot within [0, 24:00]. */
export function snapToSlot(rawMinute: number): number {
  return Math.max(0, Math.min(24 * 60, Math.floor(rawMinute / 15) * 15));
}

/** The 15-minute box a held press shows before the pointer moves. */
export function holdSlotRange(startMinute: number): SlotRange {
  return { startMinute, endMinute: Math.min(24 * 60, startMinute + 15) };
}

/**
 * Range covered by dragging from `startMinute` to the pointer's raw minute,
 * in either direction, including the whole slot under the pointer.
 */
export function dragSlotRange(startMinute: number, rawMinute: number): SlotRange {
  const currentSnapped = snapToSlot(rawMinute);
  const startMin = Math.min(startMinute, currentSnapped);
  const endMin = Math.max(startMinute, currentSnapped) + 15;
  return { startMinute: startMin, endMinute: Math.min(24 * 60, endMin) };
}

/** Range a plain click selects: the default duration, clamped to 24:00. */
export function clickSlotRange(startMinute: number, defaultDurationMinutes: number): SlotRange {
  return {
    startMinute,
    endMinute: Math.min(24 * 60, startMinute + defaultDurationMinutes),
  };
}

/** Whether the pointer has moved far enough (6 px on either axis) to count as a drag. */
export function hasSlotDragStarted(distX: number, distY: number): boolean {
  return distY >= 6 || distX >= 6;
}

/** Whether a release is close enough to its press (under 6 px on both axes) to be a click. */
export function isSlotClick(distX: number, distY: number): boolean {
  return distY < 6 && distX < 6;
}

/** Anchor for the quick-create popover: the selected range across the column, at least 20 px tall. */
export function slotAnchorRect(
  colRect: Pick<DOMRect, 'top' | 'left' | 'right' | 'width'>,
  range: SlotRange,
  hourHeight: number,
): AnchorRect {
  const slotTop = colRect.top + (range.startMinute / 60) * hourHeight;
  const slotHeight = Math.max(20, ((range.endMinute - range.startMinute) / 60) * hourHeight);
  return {
    top: slotTop,
    bottom: slotTop + slotHeight,
    left: colRect.left,
    right: colRect.right,
    width: colRect.width,
    height: slotHeight,
  };
}
