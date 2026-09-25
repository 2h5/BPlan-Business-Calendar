import { describe, expect, it } from 'vitest';

import {
  clampCrop,
  cropSourceRect,
  INITIAL_CROP,
  MAX_ZOOM,
  MIN_ZOOM,
  panCrop,
  type SourceRect,
  zoomCrop,
} from './avatar-crop';

const landscape = { width: 4000, height: 3000 };
const portrait = { width: 1080, height: 1920 };
const square = { width: 512, height: 512 };

function expectRect(actual: SourceRect, expected: SourceRect) {
  expect(actual.sx).toBeCloseTo(expected.sx);
  expect(actual.sy).toBeCloseTo(expected.sy);
  expect(actual.size).toBeCloseTo(expected.size);
}

describe('cropSourceRect', () => {
  it('starts on the centered square covering the short side', () => {
    expectRect(cropSourceRect(landscape, INITIAL_CROP), { sx: 500, sy: 0, size: 3000 });
    expectRect(cropSourceRect(portrait, INITIAL_CROP), { sx: 0, sy: 420, size: 1080 });
    expectRect(cropSourceRect(square, INITIAL_CROP), { sx: 0, sy: 0, size: 512 });
  });

  it('shows a smaller centered region when zoomed in', () => {
    expectRect(cropSourceRect(square, { zoom: 2, x: 0, y: 0 }), { sx: 128, sy: 128, size: 256 });
  });

  it('moves the region opposite to the image offset', () => {
    // Image dragged right by a quarter viewport reveals more of its left side.
    const rect = cropSourceRect(square, { zoom: 2, x: 0.25, y: 0 });
    expect(rect.sx).toBeCloseTo(64);
    expect(rect.sy).toBeCloseTo(128);
  });
});

describe('clampCrop', () => {
  it('keeps zoom within range', () => {
    expect(clampCrop(square, { zoom: 0.2, x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
    expect(clampCrop(square, { zoom: 99, x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
  });

  it('never lets an edge of the image into the viewport', () => {
    expect(clampCrop(square, { zoom: 1, x: 0.3, y: -0.3 })).toEqual({ zoom: 1, x: 0, y: 0 });
    // Landscape at zoom 1 is 4/3 wide: it may slide 1/6 each way horizontally, not at all vertically.
    const clamped = clampCrop(landscape, { zoom: 1, x: 1, y: 1 });
    expect(clamped.x).toBeCloseTo(1 / 6);
    expect(clamped.y).toBe(0);
  });

  it('keeps every crop inside the source image', () => {
    for (const state of [
      { zoom: 1, x: 5, y: 5 },
      { zoom: 3.2, x: -5, y: 2 },
      { zoom: 4, x: 0.9, y: -0.9 },
    ]) {
      const rect = cropSourceRect(portrait, clampCrop(portrait, state));
      expect(rect.sx).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.sy).toBeGreaterThanOrEqual(-1e-9);
      expect(rect.sx + rect.size).toBeLessThanOrEqual(portrait.width + 1e-9);
      expect(rect.sy + rect.size).toBeLessThanOrEqual(portrait.height + 1e-9);
    }
  });
});

describe('zoomCrop', () => {
  it('zooms around the center by default', () => {
    expect(zoomCrop(square, INITIAL_CROP, 2)).toEqual({ zoom: 2, x: 0, y: 0 });
  });

  it('keeps the point under the cursor fixed', () => {
    const focus = { x: 0.25, y: -0.25 };
    const before = { zoom: 2, x: 0.1, y: -0.1 };
    const after = zoomCrop(square, before, 3, focus);
    // The image-space point under `focus` is (focus - offset) / zoom; it must not move.
    expect((focus.x - after.x) / after.zoom).toBeCloseTo((focus.x - before.x) / before.zoom);
    expect((focus.y - after.y) / after.zoom).toBeCloseTo((focus.y - before.y) / before.zoom);
  });

  it('re-clamps the offset when zooming back out', () => {
    const zoomedIn = panCrop(square, { zoom: 4, x: 0, y: 0 }, 1.5, 1.5);
    expect(zoomCrop(square, zoomedIn, 1)).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});
