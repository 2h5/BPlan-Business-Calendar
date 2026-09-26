import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { dropIndex, moveItem, shiftFor } from '../utils/reorder';

/** Pointer travel before a press becomes a drag, so ordinary clicks still work. */
const DRAG_THRESHOLD_PX = 4;
/** How long the dropped item takes to glide into its slot. */
const SETTLE_MS = 160;

interface DragState<K> {
  key: K;
  from: number;
  to: number;
  offset: number;
  step: number;
  settling: boolean;
}

/**
 * Pointer-driven reordering for a vertical list of evenly spaced items. The
 * dragged item follows the pointer, the others slide aside, and the new order
 * is committed on release. `order` shows the committed order immediately,
 * before the caller's saved copy catches up.
 */
export function useDragReorder<K extends string>({
  order,
  onReorder,
}: {
  order: readonly K[];
  onReorder: (next: K[]) => void;
}) {
  const elements = useRef(new Map<K, HTMLElement>());
  const [drag, setDrag] = useState<DragState<K> | null>(null);
  const [pending, setPending] = useState<K[] | null>(null);
  const suppressClickRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // The caller's order changed (the save landed, or failed and reverted), so
  // stop showing the locally committed copy.
  useEffect(() => setPending(null), [order]);
  useEffect(() => () => cleanupRef.current?.(), []);

  const displayOrder = pending ?? order;

  const register = useCallback(
    (key: K) => (element: HTMLElement | null) => {
      if (element) elements.current.set(key, element);
      else elements.current.delete(key);
    },
    [],
  );

  const startDrag = (key: K, event: React.PointerEvent) => {
    if (event.button !== 0 || cleanupRef.current) return;
    const from = displayOrder.indexOf(key);
    if (from < 0) return;
    // Stops text selection and the browser's native link drag.
    event.preventDefault();

    const tops = displayOrder.map(
      (item) => elements.current.get(item)?.getBoundingClientRect().top ?? 0,
    );
    const step = tops.length > 1 ? (tops[1] ?? 0) - (tops[0] ?? 0) : 0;
    const minOffset = (tops[0] ?? 0) - (tops[from] ?? 0);
    const maxOffset = (tops[tops.length - 1] ?? 0) - (tops[from] ?? 0);
    const startY = event.clientY;
    let active = false;
    let to = from;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const handleMove = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY;
      if (!active && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      active = true;
      const offset = Math.min(maxOffset, Math.max(minOffset, dy));
      to = dropIndex(from, offset, step, displayOrder.length);
      setDrag({ key, from, to, offset, step, settling: false });
    };

    const handleUp = () => {
      removeListeners();
      if (!active) {
        cleanupRef.current = null;
        return;
      }
      // The click that follows this release must not follow the link.
      suppressClickRef.current = true;
      globalThis.setTimeout(() => (suppressClickRef.current = false), 0);
      setDrag({ key, from, to, offset: (to - from) * step, step, settling: true });
      settleTimer = globalThis.setTimeout(() => {
        cleanupRef.current = null;
        setDrag(null);
        if (to !== from) {
          const next = moveItem(displayOrder, from, to);
          setPending(next);
          onReorder(next);
        }
      }, SETTLE_MS);
    };

    const cancel = () => {
      removeListeners();
      cleanupRef.current = null;
      setDrag(null);
    };

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') cancel();
    };

    function removeListeners() {
      globalThis.removeEventListener('pointermove', handleMove);
      globalThis.removeEventListener('pointerup', handleUp);
      globalThis.removeEventListener('pointercancel', cancel);
      globalThis.removeEventListener('keydown', handleKeyDown);
    }

    globalThis.addEventListener('pointermove', handleMove);
    globalThis.addEventListener('pointerup', handleUp);
    globalThis.addEventListener('pointercancel', cancel);
    globalThis.addEventListener('keydown', handleKeyDown);
    cleanupRef.current = () => {
      removeListeners();
      if (settleTimer) globalThis.clearTimeout(settleTimer);
    };
  };

  const itemStyle = (key: K, index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    if (key === drag.key) {
      return {
        position: 'relative',
        zIndex: 2,
        transform: `translateY(${drag.offset}px)`,
        transition: drag.settling ? `transform ${SETTLE_MS}ms ease-out` : 'none',
      };
    }
    return {
      transform: `translateY(${shiftFor(index, drag.from, drag.to, drag.step)}px)`,
      transition: 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
    };
  };

  /** Swallows the click that ends a drag; attach as `onClickCapture`. */
  const suppressClickAfterDrag = (event: React.MouseEvent) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    order: displayOrder,
    draggingKey: drag?.key ?? null,
    register,
    startDrag,
    itemStyle,
    suppressClickAfterDrag,
  };
}
