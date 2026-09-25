import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

import {
  type CropState,
  type ImageSize,
  INITIAL_CROP,
  panCrop,
  type Point,
  zoomCrop,
} from '../utils/avatar-crop';

const KEY_PAN_STEP = 0.02;
const KEY_PAN_STEP_LARGE = 0.08;
const KEY_ZOOM_FACTOR = 1.1;
/** Wheel delta to zoom factor. Trackpad pinches arrive as small ctrl+wheel deltas. */
const WHEEL_SENSITIVITY = 0.0018;
const PINCH_WHEEL_SENSITIVITY = 0.01;

interface CropGestureOptions {
  image: ImageSize | null;
  setCrop: Dispatch<SetStateAction<CropState>>;
  disabled?: boolean;
}

/**
 * Drag to pan, pinch / wheel / trackpad to zoom toward the gesture, and arrow
 * keys, +/- and 0 on the focused stage. Returns a ref for the stage element and
 * whether a drag is in progress (for showing the alignment grid).
 */
export function useCropGestures({ image, setCrop, disabled = false }: CropGestureOptions) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef(image);
  imageRef.current = image;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const pointers = new Map<number, Point>();

    /** Client coordinates to viewport units, relative to the stage center. */
    const toViewport = (clientX: number, clientY: number): Point => {
      const rect = stage.getBoundingClientRect();
      return {
        x: (clientX - rect.left) / rect.width - 0.5,
        y: (clientY - rect.top) / rect.height - 0.5,
      };
    };

    const update = (next: (current: CropState, size: ImageSize) => CropState) => {
      const size = imageRef.current;
      if (!size || disabledRef.current) return;
      setCrop((current) => next(current, size));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (disabledRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
      stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      setIsDragging(true);
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const rect = stage.getBoundingClientRect();

      if (pointers.size === 1) {
        const dx = (event.clientX - previous.x) / rect.width;
        const dy = (event.clientY - previous.y) / rect.height;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        update((current, size) => panCrop(size, current, dx, dy));
        return;
      }

      // Two fingers: scale by the change in spread, anchored at their midpoint,
      // and follow the midpoint as it moves.
      const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (!other) return;
      const before = { a: previous, b: other };
      const after = { a: { x: event.clientX, y: event.clientY }, b: other };
      pointers.set(event.pointerId, after.a);
      const spread = (p: { a: Point; b: Point }) => Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y);
      const mid = (p: { a: Point; b: Point }) => ({
        x: (p.a.x + p.b.x) / 2,
        y: (p.a.y + p.b.y) / 2,
      });
      const ratio = spread(before) > 0 ? spread(after) / spread(before) : 1;
      const midBefore = mid(before);
      const midAfter = mid(after);
      update((current, size) => {
        const zoomed = zoomCrop(
          size,
          current,
          current.zoom * ratio,
          toViewport(midAfter.x, midAfter.y),
        );
        return panCrop(
          size,
          zoomed,
          (midAfter.x - midBefore.x) / rect.width,
          (midAfter.y - midBefore.y) / rect.height,
        );
      });
    };

    const onPointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size === 0) setIsDragging(false);
    };

    // Registered natively so preventDefault works; React's wheel listener is passive.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const sensitivity = event.ctrlKey ? PINCH_WHEEL_SENSITIVITY : WHEEL_SENSITIVITY;
      const factor = Math.exp(-event.deltaY * sensitivity);
      const focus = toViewport(event.clientX, event.clientY);
      update((current, size) => zoomCrop(size, current, current.zoom * factor, focus));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? KEY_PAN_STEP_LARGE : KEY_PAN_STEP;
      const actions: Record<string, (current: CropState, size: ImageSize) => CropState> = {
        ArrowLeft: (current, size) => panCrop(size, current, -step, 0),
        ArrowRight: (current, size) => panCrop(size, current, step, 0),
        ArrowUp: (current, size) => panCrop(size, current, 0, -step),
        ArrowDown: (current, size) => panCrop(size, current, 0, step),
        '+': (current, size) => zoomCrop(size, current, current.zoom * KEY_ZOOM_FACTOR),
        '=': (current, size) => zoomCrop(size, current, current.zoom * KEY_ZOOM_FACTOR),
        '-': (current, size) => zoomCrop(size, current, current.zoom / KEY_ZOOM_FACTOR),
        '0': () => INITIAL_CROP,
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      update(action);
    };

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerEnd);
    stage.addEventListener('pointercancel', onPointerEnd);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('keydown', onKeyDown);
    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', onPointerEnd);
      stage.removeEventListener('pointercancel', onPointerEnd);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKeyDown);
    };
  }, [setCrop]);

  return { stageRef, isDragging };
}
