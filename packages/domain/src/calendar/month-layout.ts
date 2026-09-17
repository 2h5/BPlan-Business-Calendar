/**
 * Row layout for the month grid.
 *
 * A month week is seven columns. An event occupying several of those days is
 * drawn as one continuous bar rather than as a mark repeated per day, so this
 * packs events into horizontal lanes: within a week, two events share a lane
 * only when their column spans do not touch.
 *
 * Like `layoutOverlappingEvents`, this is pure geometry — it returns column
 * indices and lane numbers, and the view multiplies by its own pixel width.
 */

export interface MonthSpan {
  /** Column the item starts on. May be negative when it began in an earlier week. */
  startColumn: number;
  /** Inclusive column the item ends on. May exceed the last column. */
  endColumn: number;
}

export interface MonthSegment<T> {
  item: T;
  /** Clamped to the row, 0-based. */
  startColumn: number;
  /** Clamped to the row, inclusive. */
  endColumn: number;
  /** 0-based row within the day cell. */
  lane: number;
  /** The item began before this row — draw the leading edge as continuing. */
  continuesBefore: boolean;
  /** The item runs past this row — draw the trailing edge as continuing. */
  continuesAfter: boolean;
}

export interface MonthWeekLayout<T> {
  segments: MonthSegment<T>[];
  /** Lanes actually used, so a quiet week does not reserve height it never fills. */
  laneCount: number;
  /** Count of items that did not fit, per column — drives a "+N more" affordance. */
  overflowByColumn: number[];
}

export interface LayoutMonthWeekOptions {
  /** Columns in the row. Seven for a calendar week. */
  columns?: number;
  /** Lanes to draw before spilling into the overflow count. */
  maxLanes?: number;
}

/**
 * Packs one week's items into lanes.
 *
 * Longer runs are placed first so a week-spanning bar takes the top lane and
 * short events tuck underneath it — the arrangement people expect, and the one
 * that leaves the fewest orphaned gaps.
 */
export function layoutMonthWeek<T>(
  items: readonly T[],
  getSpan: (item: T) => MonthSpan,
  options: LayoutMonthWeekOptions = {},
): MonthWeekLayout<T> {
  const columns = options.columns ?? 7;
  const maxLanes = options.maxLanes ?? Infinity;
  const lastColumn = columns - 1;

  const entries = items
    .map((item) => {
      const span = getSpan(item);
      return {
        item,
        rawStart: span.startColumn,
        rawEnd: span.endColumn,
        startColumn: Math.max(0, Math.min(lastColumn, span.startColumn)),
        endColumn: Math.max(0, Math.min(lastColumn, span.endColumn)),
      };
    })
    // Drop anything that misses the row entirely rather than clamping it to an
    // edge, where it would render as a phantom bar on a day it never touches.
    .filter((entry) => entry.rawEnd >= 0 && entry.rawStart <= lastColumn)
    .sort((a, b) => {
      const spanDifference = b.endColumn - b.startColumn - (a.endColumn - a.startColumn);
      return a.startColumn - b.startColumn || spanDifference;
    });

  const segments: MonthSegment<T>[] = [];
  const overflowByColumn = new Array<number>(columns).fill(0);
  // Per lane, the first column still free. A lane is reusable once its last
  // bar has ended, which is what keeps short events sharing a single lane.
  const laneNextFree: number[] = [];
  let laneCount = 0;

  for (const entry of entries) {
    let lane = laneNextFree.findIndex((nextFree) => nextFree <= entry.startColumn);
    if (lane === -1) lane = laneNextFree.length;

    if (lane >= maxLanes) {
      for (let column = entry.startColumn; column <= entry.endColumn; column += 1) {
        overflowByColumn[column] = (overflowByColumn[column] ?? 0) + 1;
      }
      continue;
    }

    laneNextFree[lane] = entry.endColumn + 1;
    laneCount = Math.max(laneCount, lane + 1);

    segments.push({
      item: entry.item,
      startColumn: entry.startColumn,
      endColumn: entry.endColumn,
      lane,
      continuesBefore: entry.rawStart < 0,
      continuesAfter: entry.rawEnd > lastColumn,
    });
  }

  return { segments, laneCount, overflowByColumn };
}
