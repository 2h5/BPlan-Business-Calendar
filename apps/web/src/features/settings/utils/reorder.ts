/** Returns a copy of `items` with the item at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}

/** The slot a dragged item lands in, from how far it has moved and the slot pitch. */
export function dropIndex(from: number, offset: number, step: number, count: number): number {
  if (step <= 0 || count === 0) return from;
  return Math.min(count - 1, Math.max(0, from + Math.round(offset / step)));
}

/** How far a resting item slides to make room while the item at `from` hovers over `to`. */
export function shiftFor(index: number, from: number, to: number, step: number): number {
  if (from < to && index > from && index <= to) return -step;
  if (to < from && index >= to && index < from) return step;
  return 0;
}

/**
 * Applies a new order of the visible items to the full list, leaving hidden
 * items in the slots they already had.
 */
export function mergeVisibleOrder<T>(full: readonly T[], visibleNext: readonly T[]): T[] {
  const visible = new Set(visibleNext);
  const queue = [...visibleNext];
  return full.map((item) => (visible.has(item) ? (queue.shift() ?? item) : item));
}
