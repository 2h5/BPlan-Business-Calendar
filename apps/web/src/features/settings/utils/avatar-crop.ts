/**
 * Geometry for the square avatar cropper.
 *
 * Everything is in "viewport units": the crop viewport is a 1 x 1 square, so the
 * math is independent of how many CSS pixels the stage happens to be. At zoom 1
 * the image exactly covers the viewport on its short side (CSS `object-fit: cover`).
 * `x` / `y` is how far the image center sits from the viewport center.
 */
export interface CropState {
  zoom: number;
  x: number;
  y: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface SourceRect {
  sx: number;
  sy: number;
  size: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const INITIAL_CROP: CropState = { zoom: MIN_ZOOM, x: 0, y: 0 };

/** `+ 0` folds -0 into 0 so a centered crop compares equal to INITIAL_CROP. */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) + 0;

/** The image's rendered size, in viewport units, at a zoom level. */
function displaySize(image: ImageSize, zoom: number): { width: number; height: number } {
  const scale = zoom / Math.min(image.width, image.height);
  return { width: image.width * scale, height: image.height * scale };
}

/** Keeps zoom in range and the image covering the whole viewport, so no empty edge is ever cropped in. */
export function clampCrop(image: ImageSize, state: CropState): CropState {
  const zoom = clamp(state.zoom, MIN_ZOOM, MAX_ZOOM);
  const size = displaySize(image, zoom);
  const maxX = (size.width - 1) / 2;
  const maxY = (size.height - 1) / 2;
  return { zoom, x: clamp(state.x, -maxX, maxX), y: clamp(state.y, -maxY, maxY) };
}

export function panCrop(image: ImageSize, state: CropState, dx: number, dy: number): CropState {
  return clampCrop(image, { ...state, x: state.x + dx, y: state.y + dy });
}

/**
 * Zooms while keeping the image point under `focus` fixed on screen, so zooming
 * toward the cursor or a pinch midpoint feels anchored. `focus` is relative to
 * the viewport center; the default zooms around the center.
 */
export function zoomCrop(
  image: ImageSize,
  state: CropState,
  nextZoom: number,
  focus: Point = { x: 0, y: 0 },
): CropState {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = zoom / state.zoom;
  return clampCrop(image, {
    zoom,
    x: focus.x - (focus.x - state.x) * ratio,
    y: focus.y - (focus.y - state.y) * ratio,
  });
}

/** The square of the original image, in source pixels, that the viewport shows. */
export function cropSourceRect(image: ImageSize, state: CropState): SourceRect {
  const scale = state.zoom / Math.min(image.width, image.height);
  const size = displaySize(image, state.zoom);
  const imageLeft = 0.5 + state.x - size.width / 2;
  const imageTop = 0.5 + state.y - size.height / 2;
  return { sx: -imageLeft / scale, sy: -imageTop / scale, size: 1 / scale };
}
