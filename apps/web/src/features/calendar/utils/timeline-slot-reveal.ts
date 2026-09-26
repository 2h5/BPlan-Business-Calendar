export interface SlotRevealInput {
  /** Current scroll offset of the timeline viewport. */
  scrollTop: number;
  /** Visible height of the timeline viewport. */
  viewportHeight: number;
  /** Largest valid scroll offset. */
  maxScrollTop: number;
  /** Height of the sticky header (day headers, all-day row) covering the top of the viewport. */
  headerHeight: number;
  /** Slot edges in day-column coordinates (0 = midnight). */
  slotTop: number;
  slotBottom: number;
}

/**
 * The scroll offset that brings a timeline slot fully on screen, or null when
 * it is already visible. A revealed slot sits a third of the way down the
 * visible area so the quick-create popover has room beside it.
 */
export function scrollTopToRevealSlot({
  scrollTop,
  viewportHeight,
  maxScrollTop,
  headerHeight,
  slotTop,
  slotBottom,
}: SlotRevealInput): number | null {
  const visibleHeight = Math.max(viewportHeight - headerHeight, 0);
  const isVisible = slotTop >= scrollTop && slotBottom <= scrollTop + visibleHeight;
  if (isVisible) return null;

  const target = slotTop - visibleHeight / 3;
  return Math.round(Math.min(Math.max(target, 0), Math.max(maxScrollTop, 0)));
}
