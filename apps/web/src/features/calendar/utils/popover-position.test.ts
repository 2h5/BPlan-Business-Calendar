import { describe, expect, it } from 'vitest';

import { calculatePopoverPosition, type AnchorRect } from './popover-position';

describe('calculatePopoverPosition', () => {
  const popoverWidth = 380;
  const popoverHeight = 440;
  const viewportWidth = 1200;
  const viewportHeight = 800;
  const gap = 8;
  const viewportPadding = 16;

  it('PREFERS LEFT placement for middle-column cells with room on the left', () => {
    // Middle-column cell (e.g. Wednesday or Thursday cell like September 10)
    const anchorRect: AnchorRect = {
      left: 600,
      right: 750,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    // 1. Must place immediately to the LEFT: [popover] gap [selected cell]
    expect(result.placement).toBe('left');
    // popoverLeft = selectedCellRect.left - popoverWidth - gap
    const expectedLeft = anchorRect.left - popoverWidth - gap; // 600 - 380 - 8 = 212
    expect(result.left).toBe(expectedLeft);

    // 2. Visible spacing gap between card body and cell (card must not touch cell)
    const cardRightEdge = result.left + popoverWidth;
    expect(anchorRect.left - cardRightEdge).toBe(gap);

    // 3. Must not cover selected cell
    expect(cardRightEdge).toBeLessThan(anchorRect.left);

    // 4. Must not place an untouched whole calendar column between them
    expect(anchorRect.left - cardRightEdge).toBeLessThan(anchorRect.width);

    // 5. Arrow must point to the anchor cell from the right edge of the card
    expect(result.arrowTop).not.toBeNull();
  });

  it('places popover immediately to the RIGHT when left side cannot fit but right side can', () => {
    // Column 1 cell: left edge of calendar where spaceLeft < popoverWidth + gap
    const anchorRect: AnchorRect = {
      left: 50,
      right: 200,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    // 1. Must fall back to RIGHT: [selected cell] gap [popover]
    expect(result.placement).toBe('right');
    // popoverLeft = selectedCellRect.right + gap
    const expectedLeft = anchorRect.right + gap; // 200 + 8 = 208
    expect(result.left).toBe(expectedLeft);

    // 2. Visible spacing gap between cell and card body
    expect(result.left - anchorRect.right).toBe(gap);

    // 3. Must not cover selected cell
    expect(result.left).toBeGreaterThan(anchorRect.right);

    // 4. Must not skip an entire calendar cell
    expect(result.left - anchorRect.right).toBeLessThan(anchorRect.width);

    // 5. Must stay within viewport right boundary
    expect(result.left + popoverWidth).toBeLessThanOrEqual(viewportWidth - viewportPadding);
  });

  it('places popover to the LEFT for rightmost column cells', () => {
    // Column 7 cell (e.g. Saturday)
    const anchorRect: AnchorRect = {
      left: 950,
      right: 1100,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    expect(result.placement).toBe('left');
    expect(result.left).toBe(anchorRect.left - popoverWidth - gap);
    expect(anchorRect.left - (result.left + popoverWidth)).toBe(gap);
    expect(result.left).toBeGreaterThanOrEqual(viewportPadding);
  });

  it('recalculates position accurately when switching between different date cells', () => {
    // First selected date (e.g. Sep 10, Thu)
    const date1Rect: AnchorRect = {
      left: 600,
      right: 750,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result1 = calculatePopoverPosition({
      anchorRect: date1Rect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    // Second selected date (e.g. Sep 9, Wed with left = 500, has room on left)
    const date2Rect: AnchorRect = {
      left: 500,
      right: 650,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result2 = calculatePopoverPosition({
      anchorRect: date2Rect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    // Result 1 should be adjacent to date 1
    expect(result1.placement).toBe('left');
    expect(result1.left).toBe(date1Rect.left - popoverWidth - gap);
    // Result 2 must be adjacent to date 2, not retaining stale date 1 coordinates
    expect(result2.placement).toBe('left');
    expect(result2.left).toBe(date2Rect.left - popoverWidth - gap);
    expect(result2.left).not.toBe(result1.left);
  });

  it('clamps top to viewportPadding for cells near the top of the viewport', () => {
    const anchorRect: AnchorRect = {
      left: 500,
      right: 650,
      top: 10,
      bottom: 110,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    expect(result.top).toBe(viewportPadding);
    expect(result.arrowTop).toBeGreaterThanOrEqual(16);
    expect(result.arrowTop).toBeLessThanOrEqual(popoverHeight - 26);
  });

  it('clamps top to maxTop for cells near the bottom of the viewport', () => {
    const anchorRect: AnchorRect = {
      left: 500,
      right: 650,
      top: 650,
      bottom: 750,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    const expectedMaxTop = viewportHeight - popoverHeight - viewportPadding;
    expect(result.top).toBe(expectedMaxTop);
    expect(result.arrowTop).toBeLessThanOrEqual(popoverHeight - 26);
  });

  it('accurately points arrow at anchor cell target Y', () => {
    const anchorRect: AnchorRect = {
      left: 500,
      right: 650,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    expect(result.top).toBe(192);
    // Absolute position of the diamond tip = result.top + result.arrowTop + 5 = 200 + 28 = 228
    expect(result.top + (result.arrowTop ?? 0) + 5).toBe(228);
  });

  it('chooses the side with more space when neither side has full room', () => {
    // Narrow viewport (e.g. 780px wide) where anchor is at [350, 500]
    // spaceLeft = 350 - 16 = 334 (< 388)
    // spaceRight = 780 - 500 - 16 = 264 (< 334)
    // spaceLeft >= spaceRight -> chooses left
    const anchorRect: AnchorRect = {
      left: 350,
      right: 500,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth: 780,
      viewportHeight,
      gap,
      viewportPadding,
    });

    expect(result.placement).toBe('left');
    expect(result.left).toBeGreaterThanOrEqual(viewportPadding);
  });

  it('returns bottom sheet placement on mobile viewports (< 768px)', () => {
    const anchorRect: AnchorRect = {
      left: 100,
      right: 250,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth: 400,
      viewportHeight: 700,
      gap,
      viewportPadding,
    });

    expect(result.placement).toBe('bottom');
    expect(result.arrowTop).toBeNull();
  });

  it('never clamps an impossible left placement into a position that overlaps the anchor cell', () => {
    // Cell at left = 300, right = 450.
    // canFitLeft: 300 - 380 - 8 = -88 < 16 (FALSE)
    // canFitRight: 450 + 380 + 8 = 838 <= 1184 (TRUE)
    // Must place to the RIGHT, never clamp left to 16 (which would overlap cell [300..450])
    const anchorRect: AnchorRect = {
      left: 300,
      right: 450,
      top: 200,
      bottom: 300,
      width: 150,
      height: 100,
    };

    const result = calculatePopoverPosition({
      anchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    // Must place to the right
    expect(result.placement).toBe('right');
    expect(result.left).toBe(anchorRect.right + gap); // 450 + 8 = 458
    // Zero overlap with the selected cell
    expect(result.left).toBeGreaterThan(anchorRect.right);
    // Selected cell is an exclusion zone
    const popoverRight = result.left + popoverWidth;
    const overlapsAnchor = !(popoverRight <= anchorRect.left || result.left >= anchorRect.right);
    expect(overlapsAnchor).toBe(false);
  });

  it('centers popover when anchorRect is null', () => {
    const result = calculatePopoverPosition({
      anchorRect: null,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
      gap,
      viewportPadding,
    });

    expect(result.placement).toBe('center');
    expect(result.arrowTop).toBeNull();
    expect(result.left).toBe((viewportWidth - popoverWidth) / 2);
  });
});
