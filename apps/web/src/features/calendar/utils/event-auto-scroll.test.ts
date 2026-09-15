import { describe, expect, it } from 'vitest';

import {
  AUTO_SCROLL_EDGE_ZONE_PX,
  AUTO_SCROLL_MAX_SPEED_PX,
  AUTO_SCROLL_MIN_SPEED_PX,
  calculateAutoScrollVelocity,
  clampScrollTop,
  type ViewportBounds,
} from './event-auto-scroll';

describe('event-auto-scroll math and bounds', () => {
  const viewport: ViewportBounds = {
    top: 100,
    bottom: 700,
    height: 600,
  };

  it('exports expected default constants', () => {
    expect(AUTO_SCROLL_EDGE_ZONE_PX).toBe(44);
    expect(AUTO_SCROLL_MAX_SPEED_PX).toBe(16);
    expect(AUTO_SCROLL_MIN_SPEED_PX).toBe(2);
  });

  it('returns 0 velocity when pointer is comfortably in the center zone', () => {
    // Center of viewport: clientY = 400
    expect(calculateAutoScrollVelocity(400, viewport)).toBe(0);
    // Just below top zone (top is 100, edgeZone is 44 => zone is <= 144)
    expect(calculateAutoScrollVelocity(150, viewport)).toBe(0);
    // Just above bottom zone (bottom is 700, edgeZone is 44 => zone is >= 656)
    expect(calculateAutoScrollVelocity(650, viewport)).toBe(0);
  });

  it('returns negative velocity (upward scroll) when pointer is inside top edge zone', () => {
    // Inside top edge zone: clientY = 120 (between 100 and 144)
    const vel = calculateAutoScrollVelocity(120, viewport);
    expect(vel).toBeLessThan(0);
    expect(Math.abs(vel)).toBeGreaterThanOrEqual(AUTO_SCROLL_MIN_SPEED_PX);
    expect(Math.abs(vel)).toBeLessThanOrEqual(AUTO_SCROLL_MAX_SPEED_PX);
  });

  it('returns positive velocity (downward scroll) when pointer is inside bottom edge zone', () => {
    // Inside bottom edge zone: clientY = 680 (between 656 and 700)
    const vel = calculateAutoScrollVelocity(680, viewport);
    expect(vel).toBeGreaterThan(0);
    expect(vel).toBeGreaterThanOrEqual(AUTO_SCROLL_MIN_SPEED_PX);
    expect(vel).toBeLessThanOrEqual(AUTO_SCROLL_MAX_SPEED_PX);
  });

  it('accelerates non-linearly as pointer gets closer to the edge', () => {
    // In top zone: clientY 140 (near inner boundary) vs 120 vs 100 (at edge)
    const velInner = Math.abs(calculateAutoScrollVelocity(140, viewport));
    const velMid = Math.abs(calculateAutoScrollVelocity(120, viewport));
    const velEdge = Math.abs(calculateAutoScrollVelocity(100, viewport));

    expect(velInner).toBeLessThan(velMid);
    expect(velMid).toBeLessThan(velEdge);
    expect(velEdge).toBe(AUTO_SCROLL_MAX_SPEED_PX);
  });

  it('caps at maximum speed when pointer is beyond the outer viewport edge', () => {
    // Above top edge
    expect(calculateAutoScrollVelocity(50, viewport)).toBe(-AUTO_SCROLL_MAX_SPEED_PX);
    // Below bottom edge
    expect(calculateAutoScrollVelocity(800, viewport)).toBe(AUTO_SCROLL_MAX_SPEED_PX);
  });

  it('returns 0 if viewport is degenerately small or invalid', () => {
    const smallViewport: ViewportBounds = {
      top: 100,
      bottom: 150,
      height: 50, // smaller than 2 * 44 = 88
    };
    expect(calculateAutoScrollVelocity(120, smallViewport)).toBe(0);
    expect(calculateAutoScrollVelocity(Number.NaN, viewport)).toBe(0);
  });

  it('clamps scroll target to [0, maxScroll]', () => {
    const scrollHeight = 2400;
    const clientHeight = 600;
    const maxScroll = 1800;

    // Normal in-range
    expect(clampScrollTop(500, scrollHeight, clientHeight)).toBe(500);

    // Negative (above top)
    expect(clampScrollTop(-20, scrollHeight, clientHeight)).toBe(0);

    // Beyond bottom
    expect(clampScrollTop(2000, scrollHeight, clientHeight)).toBe(maxScroll);

    // Container where content fits client
    expect(clampScrollTop(100, 500, 600)).toBe(0);
  });
});
