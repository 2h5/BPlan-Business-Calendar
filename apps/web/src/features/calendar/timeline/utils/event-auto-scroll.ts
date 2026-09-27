export const AUTO_SCROLL_EDGE_ZONE_PX = 44;
export const AUTO_SCROLL_MAX_SPEED_PX = 16;
export const AUTO_SCROLL_MIN_SPEED_PX = 2;

export interface ViewportBounds {
  top: number;
  bottom: number;
  height: number;
}

/**
 * Calculates auto-scroll velocity (in pixels per frame) given the pointer's Y coordinate
 * relative to the viewport bounds.
 *
 * Returns:
 * - negative number when scrolling upward (pointer in top edge zone)
 * - positive number when scrolling downward (pointer in bottom edge zone)
 * - 0 when pointer is outside edge zones or viewport bounds are invalid
 */
export function calculateAutoScrollVelocity(
  clientY: number,
  viewport: ViewportBounds,
  edgeZonePx = AUTO_SCROLL_EDGE_ZONE_PX,
  maxSpeed = AUTO_SCROLL_MAX_SPEED_PX,
  minSpeed = AUTO_SCROLL_MIN_SPEED_PX,
): number {
  if (!Number.isFinite(clientY) || !viewport || viewport.height <= edgeZonePx * 2) {
    return 0;
  }

  // Top zone: clientY is near or above viewport.top
  if (clientY <= viewport.top + edgeZonePx) {
    const distanceFromEdge = Math.max(0, clientY - viewport.top);
    // ratio: 0 at the exact top edge (or outside above), 1 at the inner threshold
    const ratio = Math.min(1, distanceFromEdge / edgeZonePx);
    // closer to edge => intensity closer to 1
    const intensity = 1 - ratio;
    const speed = minSpeed + (maxSpeed - minSpeed) * (intensity * intensity);
    return -speed;
  }

  // Bottom zone: clientY is near or below viewport.bottom
  if (clientY >= viewport.bottom - edgeZonePx) {
    const distanceFromEdge = Math.max(0, viewport.bottom - clientY);
    // ratio: 0 at the exact bottom edge (or outside below), 1 at the inner threshold
    const ratio = Math.min(1, distanceFromEdge / edgeZonePx);
    // closer to edge => intensity closer to 1
    const intensity = 1 - ratio;
    const speed = minSpeed + (maxSpeed - minSpeed) * (intensity * intensity);
    return speed;
  }

  return 0;
}

/**
 * Clamps target scroll position to valid container bounds [0, maxScrollTop].
 */
export function clampScrollTop(
  desiredScrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  return Math.max(0, Math.min(maxScroll, desiredScrollTop));
}
