export interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export type PopoverPlacement = 'right' | 'left' | 'center' | 'bottom';

export interface PopoverPositionOptions {
  anchorRect: AnchorRect | null;
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  gap?: number;
  margin?: number; // alias for gap for backwards compatibility
  viewportPadding?: number;
}

export interface PopoverPositionResult {
  top: number;
  left: number;
  placement: PopoverPlacement;
  arrowTop: number | null;
}

/**
 * Calculates deterministic popover placement adjacent to the anchor cell.
 *
 * Rules:
 * 1. Mobile viewport (< 768px): returns bottom sheet placement.
 * 2. If no anchorRect provided: center in viewport.
 * 3. Horizontal placement priority:
 *    - PREFERRED: LEFT of selected cell (popoverLeft = selectedCellRect.left - popoverWidth - gap)
 *      so the card appears immediately to the left with an intentional visual gap (default 8px).
 *    - RIGHT of selected cell only if the card genuinely cannot fit on the left
 *      (popoverLeft = selectedCellRect.right + gap).
 *    - Collision / clamping fallback only when neither side fits normally, choosing the side
 *      with more available space and clamping within viewport bounds.
 * 4. Vertical placement:
 *    - Aligns near the top of the anchor cell (-8px offset for visual header alignment), clamped to viewport bounds.
 * 5. Arrow alignment:
 *    - Points directly at the anchor cell's visual focal point (date header / center).
 *    - If card is LEFT: arrow is on the right edge of the card, pointing towards the selected cell.
 *    - If card is RIGHT: arrow is on the left edge of the card, pointing towards the selected cell.
 */
export function calculatePopoverPosition(options: PopoverPositionOptions): PopoverPositionResult {
  const {
    anchorRect,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
    gap: propGap,
    margin: propMargin,
    viewportPadding = 16,
  } = options;

  const gap = propGap ?? propMargin ?? 8;

  // 1. Mobile breakpoint (< 768px): popover renders as a bottom sheet
  if (viewportWidth < 768) {
    return {
      top: 0,
      left: 0,
      placement: 'bottom',
      arrowTop: null,
    };
  }

  // 2. Center fallback when no anchor is provided
  if (!anchorRect) {
    return {
      top: Math.round(viewportHeight * 0.2),
      left: Math.round(Math.max(viewportPadding, (viewportWidth - popoverWidth) / 2)),
      placement: 'center',
      arrowTop: null,
    };
  }

  // 3. Horizontal Placement
  // Placement must be selected BEFORE clamping.
  // The selected cell is an exclusion zone whenever either adjacent placement is possible.
  const canFitLeft = anchorRect.left - popoverWidth - gap >= viewportPadding;
  const canFitRight = anchorRect.right + popoverWidth + gap <= viewportWidth - viewportPadding;

  let placement: 'right' | 'left';
  let left: number;

  if (canFitLeft) {
    // 1. PREFERRED: Immediately to the LEFT of the selected cell with gap
    placement = 'left';
    left = anchorRect.left - popoverWidth - gap;
  } else if (canFitRight) {
    // 2. Fallback: Immediately to the RIGHT of the selected cell (left cannot fit)
    placement = 'right';
    left = anchorRect.right + gap;
  } else {
    // 3. Constrained fallback only when NEITHER adjacent side can fit normally without leaving viewport
    const spaceLeft = anchorRect.left - viewportPadding;
    const spaceRight = viewportWidth - anchorRect.right - viewportPadding;

    if (spaceLeft >= spaceRight) {
      placement = 'left';
      left = Math.max(viewportPadding, anchorRect.left - popoverWidth - gap);
    } else {
      placement = 'right';
      const maxLeft = viewportWidth - popoverWidth - viewportPadding;
      left = Math.min(maxLeft, anchorRect.right + gap);
    }
  }

  // 4. Vertical Placement
  // Align neatly near the top of the selected cell (-8px so it lines up with cell header/date badge)
  const maxTop = Math.max(viewportPadding, viewportHeight - popoverHeight - viewportPadding);
  const minTop = viewportPadding;
  const top = Math.max(minTop, Math.min(maxTop, anchorRect.top - 8));

  // 5. Arrow Alignment
  // Point directly at the anchor cell.
  // For tall cells (such as MonthView cells, height > 60px), point at the date badge / top area (~28px from cell top).
  // For shorter slots (such as TimelineView slots), point at the vertical center of the slot.
  const anchorTargetY =
    anchorRect.height > 60
      ? anchorRect.top + Math.min(28, anchorRect.height / 2)
      : anchorRect.top + anchorRect.height / 2;

  // Diamond arrow is 10px tall, rotated 45deg, so its horizontal tip is at arrowTop + 5
  const rawArrowTop = anchorTargetY - top - 5;
  // Keep arrow within popover boundaries (padding from top/bottom borders to avoid rounded corners)
  const arrowTop = Math.max(16, Math.min(popoverHeight - 26, Math.round(rawArrowTop)));

  return {
    top: Math.round(top),
    left: Math.round(left),
    placement,
    arrowTop,
  };
}
