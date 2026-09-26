import {
  addZonedDays,
  type LaidOutItem,
  layoutOverlappingEvents,
  MIN_VISUAL_MINUTES,
  minuteOfDay,
  toZonedDateKey,
} from '@cal/domain';

import type { EventOccurrence } from './calendar-occurrences';
import { dateKeyToInstant } from './calendar-window';
import { dateMinuteToInstant, type MinuteInterval } from './event-resize';

const DRAFT_LAYOUT_KEY = '__quick-create-draft__';

/** The unsaved quick-create draft, placed alongside real events in the overlap layout. */
interface DraftLayoutSlot {
  key: typeof DRAFT_LAYOUT_KEY;
  start: number;
  end: number;
}

function isOccurrence(item: EventOccurrence | DraftLayoutSlot): item is EventOccurrence {
  return 'event' in item;
}

/**
 * Keeps event buttons in one fixed DOM order. Layout output is grouped by
 * column, so rendering it directly makes React move nodes whenever columns
 * change, and moving a node drops its pointer capture in the middle of a drag.
 */
function sortByRenderOrder<T extends { item: { key: string } }>(
  laidOut: T[],
  source: readonly { key: string }[],
): T[] {
  const rank = new Map(source.map((item, index) => [item.key, index]));
  return [...laidOut].sort((a, b) => (rank.get(a.item.key) ?? 0) - (rank.get(b.item.key) ?? 0));
}

/** An in-progress resize or move, as the layout needs to see it. */
export interface TimelineGestureSnapshot {
  occurrenceKey: string;
  /** Wall-clock minutes the gesture started from; used for column ordering. */
  originalMinutes: MinuteInterval;
  /** Wall-clock minutes the gesture currently previews. */
  currentMinutes: MinuteInterval;
}

export interface TimelineMoveSnapshot extends TimelineGestureSnapshot {
  /** Day column the dragged event is currently previewed in. */
  dateKey: string;
}

export interface TimelineDayDraft {
  dateKey: string;
  startMinute?: number;
  endMinute?: number;
  allDay?: boolean;
}

export interface TimelineDayLayoutInput {
  dateKey: string;
  timeZone: string;
  /** Every timed occurrence in the view, in the order event buttons are rendered. */
  occurrences: readonly EventOccurrence[];
  /** Optimistic timings keyed by event id. */
  timingOverrides?: ReadonlyMap<string, { start: number; end: number }>;
  /** The active resize, if any. */
  resize: TimelineGestureSnapshot | null;
  /**
   * Occurrence whose resize preview is showing. The resized event is only
   * re-timed to `resize.currentMinutes` when this matches it.
   */
  resizePreviewKey: string | null;
  /** The active move, only once it is dragging and its preview is showing. */
  move: TimelineMoveSnapshot | null;
  draft?: TimelineDayDraft | null;
  /** A slot drag-selection hides the timed draft, so it takes no column. */
  hasDragSelection: boolean;
}

export interface TimelineDayEventPlacement extends LaidOutItem<EventOccurrence> {
  /** Visible start within the day, 0–1440. */
  startMinute: number;
  /** Visible end within the day, 0–1440. */
  endMinute: number;
}

export interface TimelineDayLayout {
  /** Timed events for the day, in stable render order (not column order). */
  events: TimelineDayEventPlacement[];
  /** Column the timed quick-create draft occupies, when it is on this day. */
  draftPlacement: { left: number; width: number } | undefined;
}

/**
 * Places one day column's timed events: which events belong to the day
 * (honouring optimistic timings and a live cross-day move), where an active
 * resize or move previews them, how overlaps split into columns, and where the
 * quick-create draft sits. Pure; `TimelineView` renders the result.
 */
export function layoutTimelineDay({
  dateKey,
  timeZone,
  occurrences,
  timingOverrides,
  resize,
  resizePreviewKey,
  move,
  draft,
  hasDragSelection,
}: TimelineDayLayoutInput): TimelineDayLayout {
  const dayStart = dateKeyToInstant(dateKey, timeZone);
  const dayEnd = addZonedDays(dayStart, 1, timeZone);

  const timed = occurrences
    .filter((item) => {
      if (move && item.key === move.occurrenceKey) {
        return move.dateKey === dateKey;
      }
      const optimistic = timingOverrides?.get(item.event.id);
      if (optimistic) {
        return toZonedDateKey(new Date(optimistic.start), timeZone) === dateKey;
      }
      return toZonedDateKey(new Date(item.start), timeZone) === dateKey;
    })
    .map((item) => {
      const optimistic = timingOverrides?.get(item.event.id);
      const isThisResizing = resizePreviewKey === item.key && Boolean(resize);
      const isThisMoving = Boolean(move) && item.key === move?.occurrenceKey;

      if (isThisResizing && resize) {
        const start = dateMinuteToInstant(dateKey, resize.currentMinutes.startMinute, timeZone);
        const end = dateMinuteToInstant(dateKey, resize.currentMinutes.endMinute, timeZone);
        if (start && end) return { ...item, start: start.getTime(), end: end.getTime() };
      }
      if (isThisMoving && move) {
        const start = dateMinuteToInstant(dateKey, move.currentMinutes.startMinute, timeZone);
        const end = dateMinuteToInstant(dateKey, move.currentMinutes.endMinute, timeZone);
        if (start && end) return { ...item, start: start.getTime(), end: end.getTime() };
      }
      return optimistic ? { ...item, ...optimistic } : item;
    });
  const visibleInterval = (item: { start: number; end: number }) => ({
    start: Math.max(item.start, dayStart.getTime()),
    end: Math.max(
      Math.min(item.end, dayEnd.getTime()),
      Math.max(item.start, dayStart.getTime()) + MIN_VISUAL_MINUTES * 60_000,
    ),
  });
  // While an event is being resized or dragged, order columns by where it
  // started, not where the pointer has taken it. Otherwise it swaps sides
  // each time it passes a neighbour's start (and flickers when a magnetic
  // snap makes the two starts equal). The normal order returns on drop.
  const gesture = resize
    ? { key: resize.occurrenceKey, minutes: resize.originalMinutes }
    : move
      ? { key: move.occurrenceKey, minutes: move.originalMinutes }
      : null;
  const gestureStart = gesture
    ? dateMinuteToInstant(dateKey, gesture.minutes.startMinute, timeZone)
    : null;
  const gestureEnd = gesture
    ? dateMinuteToInstant(dateKey, gesture.minutes.endMinute, timeZone)
    : null;
  const gestureOrder =
    gestureStart && gestureEnd
      ? visibleInterval({ start: gestureStart.getTime(), end: gestureEnd.getTime() })
      : null;
  // The quick-create draft takes a real layout column so events it
  // overlaps shift aside instead of being hidden underneath it.
  const draftStart =
    draft &&
    draft.dateKey === dateKey &&
    !draft.allDay &&
    draft.startMinute !== undefined &&
    draft.endMinute !== undefined &&
    !hasDragSelection
      ? dateMinuteToInstant(dateKey, draft.startMinute, timeZone)
      : null;
  const draftEnd =
    draftStart && draft?.endMinute !== undefined
      ? dateMinuteToInstant(dateKey, draft.endMinute, timeZone)
      : null;
  const draftSlot: DraftLayoutSlot | null =
    draftStart && draftEnd
      ? { key: DRAFT_LAYOUT_KEY, start: draftStart.getTime(), end: draftEnd.getTime() }
      : null;
  const layout = layoutOverlappingEvents<EventOccurrence | DraftLayoutSlot>(
    draftSlot ? [...timed, draftSlot] : timed,
    visibleInterval,
    {
      getOrderInterval: (item) => {
        // Keep the draft in the rightmost column it can take.
        if (item === draftSlot) {
          return { start: Number.MAX_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER };
        }
        return gestureOrder && item.key === gesture?.key ? gestureOrder : visibleInterval(item);
      },
    },
  );
  const draftPlacement = layout.find((placed) => placed.item === draftSlot);
  const laidOut = sortByRenderOrder(
    layout.filter((placed): placed is LaidOutItem<EventOccurrence> => isOccurrence(placed.item)),
    timed,
  );

  return {
    events: laidOut.map((placed) => ({
      ...placed,
      startMinute:
        placed.interval.start <= dayStart.getTime()
          ? 0
          : minuteOfDay(new Date(placed.interval.start), timeZone),
      endMinute:
        placed.interval.end >= dayEnd.getTime()
          ? 24 * 60
          : minuteOfDay(new Date(placed.interval.end), timeZone),
    })),
    draftPlacement: draftPlacement && { left: draftPlacement.left, width: draftPlacement.width },
  };
}
