import { animateScrollTop } from './animate-scroll';
import type { CalendarViewMode } from './calendar-window';
import type { AnchorRect } from './popover-position';
import { scrollTopToRevealSlot } from './timeline-slot-reveal';

export function getNewEventAnchorRect(
  dateKey: string,
  startMinute: number,
  endMinute: number,
  mode: CalendarViewMode,
): AnchorRect | null {
  const dayElement = document.querySelector<HTMLElement>(`[data-date-key="${dateKey}"]`);
  if (!dayElement) return null;
  let rect = dayElement.getBoundingClientRect();
  if (mode === 'month') {
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
  }

  const hourHeight = mode === 'week' ? 54 : 64;
  const height = Math.max(22, ((endMinute - startMinute) / 60) * hourHeight - 2);

  // Bring the slot on screen first (e.g. "New Event" at 9 PM while scrolled to
  // the morning), then measure, so the draft and its popover are both visible.
  const viewport = dayElement.closest<HTMLElement>('[data-timeline-viewport]');
  if (viewport) {
    const viewportRect = viewport.getBoundingClientRect();
    const slotTop = (startMinute / 60) * hourHeight;
    const nextScrollTop = scrollTopToRevealSlot({
      scrollTop: viewport.scrollTop,
      viewportHeight: viewport.clientHeight,
      maxScrollTop: viewport.scrollHeight - viewport.clientHeight,
      headerHeight: rect.top - viewportRect.top + viewport.scrollTop,
      slotTop,
      slotBottom: slotTop + height,
    });
    if (nextScrollTop !== null) {
      // Anchor at where the slot lands; the popover then rides the scroll with the draft.
      rect = new DOMRect(
        rect.left,
        rect.top - (nextScrollTop - viewport.scrollTop),
        rect.width,
        rect.height,
      );
      animateScrollTop(viewport, nextScrollTop);
    }
  }

  const top = rect.top + (startMinute / 60) * hourHeight;
  return {
    top,
    bottom: top + height,
    left: rect.left,
    right: rect.right,
    width: rect.width,
    height,
  };
}
