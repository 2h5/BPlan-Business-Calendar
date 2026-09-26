import { useEffect, useRef, useState } from 'react';

import styles from '../components/CalendarView.module.css';
import type { SlotSelection } from '../components/TimelineView';
import {
  clickSlotRange,
  dragSlotRange,
  hasSlotDragStarted,
  holdSlotRange,
  isSlotClick,
  SLOT_HOLD_DELAY_MS,
  slotAnchorRect,
  snapSlotStart,
} from '../utils/slot-selection';

/** The range being press-held or dragged on one day column. */
export interface TimelineDragSelection {
  dateKey: string;
  startMinute: number;
  endMinute: number;
}

type ColumnPointerHandler = (e: React.PointerEvent<HTMLDivElement>, dateKey: string) => void;

export interface TimelineSlotSelection {
  /** The range to highlight while a press is held or dragged; `null` otherwise. */
  dragSelection: TimelineDragSelection | null;
  handleColumnPointerDown: ColumnPointerHandler;
  handleColumnPointerMove: ColumnPointerHandler;
  handleColumnPointerUp: ColumnPointerHandler;
  handleColumnPointerCancel: ColumnPointerHandler;
}

export interface UseTimelineSlotSelectionOptions {
  hourHeight: number;
  defaultDurationMinutes: number;
  onSelectSlot?: (selection: SlotSelection) => void;
}

/**
 * Selecting a time range on a timed day column: a click selects the default
 * duration, holding shows a 15-minute box after a short delay, and dragging
 * selects 15-minute slots. Presses that start on an event are ignored.
 *
 * Handlers are recreated every render and read `dragSelection` from that
 * render, as they did inline in `TimelineView`.
 */
export function useTimelineSlotSelection({
  hourHeight,
  defaultDurationMinutes,
  onSelectSlot,
}: UseTimelineSlotSelectionOptions): TimelineSlotSelection {
  const [dragSelection, setDragSelection] = useState<TimelineDragSelection | null>(null);

  const dragRef = useRef<{
    dateKey: string;
    startY: number;
    startX: number;
    startMinute: number;
    colRect: DOMRect;
  } | null>(null);

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const handleColumnPointerDown: ColumnPointerHandler = (e, dateKey) => {
    if ((e.target as HTMLElement).closest(`.${styles.timelineEvent}`)) return;
    if (e.button !== 0) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    const colRect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - colRect.top;
    const rawMinute = (y / hourHeight) * 60;
    const startMinute = snapSlotStart(rawMinute);

    dragRef.current = {
      dateKey,
      startY: e.clientY,
      startX: e.clientX,
      startMinute,
      colRect,
    };

    // If user holds down the pointer, display the 15-minute selection box after the hold delay.
    // Quick clicks release before this timer fires, preventing any 1-frame flash before the animation.
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (dragRef.current && dragRef.current.dateKey === dateKey) {
        setDragSelection({ dateKey, ...holdSlotRange(startMinute) });
      }
    }, SLOT_HOLD_DELAY_MS);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleColumnPointerMove: ColumnPointerHandler = (e, dateKey) => {
    if (!dragRef.current || dragRef.current.dateKey !== dateKey) return;

    const distY = Math.abs(e.clientY - dragRef.current.startY);
    const distX = Math.abs(e.clientX - dragRef.current.startX);
    const hasMoved = hasSlotDragStarted(distX, distY);

    if (!hasMoved && !dragSelection) {
      return;
    }

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    const colRect = dragRef.current.colRect;
    const y = Math.max(0, Math.min(colRect.height, e.clientY - colRect.top));
    const rawMinute = (y / hourHeight) * 60;

    setDragSelection({ dateKey, ...dragSlotRange(dragRef.current.startMinute, rawMinute) });
  };

  const handleColumnPointerUp: ColumnPointerHandler = (e, dateKey) => {
    if (!dragRef.current || dragRef.current.dateKey !== dateKey) return;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const dragInfo = dragRef.current;
    dragRef.current = null;

    const distY = Math.abs(e.clientY - dragInfo.startY);
    const distX = Math.abs(e.clientX - dragInfo.startX);
    const isClick = isSlotClick(distX, distY);

    let range = clickSlotRange(dragInfo.startMinute, defaultDurationMinutes);

    if (!isClick && dragSelection) {
      range = { startMinute: dragSelection.startMinute, endMinute: dragSelection.endMinute };
    }

    setDragSelection(null);

    if (onSelectSlot) {
      onSelectSlot({
        dateKey,
        startMinute: range.startMinute,
        endMinute: range.endMinute,
        anchorRect: slotAnchorRect(dragInfo.colRect, range, hourHeight),
      });
    }
  };

  const handleColumnPointerCancel: ColumnPointerHandler = (e, dateKey) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (dragRef.current?.dateKey === dateKey) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragRef.current = null;
      setDragSelection(null);
    }
  };

  return {
    dragSelection,
    handleColumnPointerDown,
    handleColumnPointerMove,
    handleColumnPointerUp,
    handleColumnPointerCancel,
  };
}
