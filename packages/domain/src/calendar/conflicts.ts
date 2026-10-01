import { type Interval, overlaps } from '../time/interval';

/**
 * The items that share time with at least one other item.
 *
 * `getInterval` returns null for anything that cannot conflict — an all-day
 * event or a cancelled one — so callers decide what counts as busy and this
 * stays pure interval arithmetic. Intervals are half-open, so back-to-back
 * meetings do not conflict.
 *
 * A day holds a handful of events, so a pairwise check is clearer than a
 * sweep and costs nothing measurable.
 */
export function findConflictingItems<T>(
  items: readonly T[],
  getInterval: (item: T) => Interval | null,
): Set<T> {
  const timed = items.flatMap((item) => {
    const interval = getInterval(item);
    return interval ? [{ item, interval }] : [];
  });

  const conflicting = new Set<T>();
  for (let i = 0; i < timed.length; i += 1) {
    for (let j = i + 1; j < timed.length; j += 1) {
      const a = timed[i];
      const b = timed[j];
      if (a && b && overlaps(a.interval, b.interval)) {
        conflicting.add(a.item);
        conflicting.add(b.item);
      }
    }
  }
  return conflicting;
}
