import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

import { useFollowAnchorMotion } from './useFollowAnchorMotion';
import type { EventOccurrence } from '../../utils/calendar-occurrences';
import {
  calculatePopoverPosition,
  type AnchorRect,
  type PopoverPlacement,
} from '../../utils/popover-position';

interface QuickCreatePositionOptions {
  isOpen: boolean;
  anchorRect: AnchorRect | null;
  editingOccurrence?: EventOccurrence | null;
  popoverRef: RefObject<HTMLDivElement | null>;
  mode: 'event' | 'task';
  errorMessage: string | null;
}

interface QuickCreateCoords {
  style: React.CSSProperties;
  placement: PopoverPlacement;
  arrowTop: number | null;
  arrowLeft: number | null;
  maxHeight: number | null;
}

export function useQuickCreatePosition({
  isOpen,
  anchorRect,
  editingOccurrence,
  popoverRef,
  mode,
  errorMessage,
}: QuickCreatePositionOptions): QuickCreateCoords {
  const [coords, setCoords] = useState<QuickCreateCoords>({
    style: { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
    placement: 'center',
    arrowTop: null,
    arrowLeft: null,
    maxHeight: null,
  });

  /** The on-screen block the card points at: the edited event, or the new-event draft. */
  const getAnchorElement = useCallback((): HTMLElement | null => {
    if (editingOccurrence) {
      const eventElements = document.querySelectorAll<HTMLElement>('[data-occurrence-key]');
      return (
        Array.from(eventElements).find(
          (element) => element.dataset.occurrenceKey === editingOccurrence.key,
        ) ?? null
      );
    }
    return document.querySelector<HTMLElement>('[data-quick-create-draft="true"]');
  }, [editingOccurrence]);

  const updatePosition = useCallback(() => {
    if (!isOpen) return;

    const popoverWidth = popoverRef.current ? popoverRef.current.offsetWidth : 440;
    const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 440;

    let currentAnchorRect = anchorRect;
    if (editingOccurrence) {
      const eventElement = getAnchorElement();
      if (eventElement) {
        const rect = eventElement.getBoundingClientRect();
        currentAnchorRect = {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      }
    } else {
      const draftElement = getAnchorElement();
      if (draftElement) {
        // The draft grows in from scaleY(0) with a top origin, so its transformed rect is
        // collapsed on the first frame. Use its layout size so the card clears the whole block.
        const rect = draftElement.getBoundingClientRect();
        const width = draftElement.offsetWidth || rect.width;
        const height = draftElement.offsetHeight || rect.height;
        currentAnchorRect = {
          top: rect.top,
          bottom: rect.top + height,
          left: rect.left,
          right: rect.left + width,
          width,
          height,
        };
      }
    }

    const result = calculatePopoverPosition({
      anchorRect: currentAnchorRect,
      popoverWidth,
      popoverHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      gap: 8,
    });

    if (result.placement === 'bottom') {
      setCoords({
        style: {},
        placement: 'bottom',
        arrowTop: null,
        arrowLeft: null,
        maxHeight: null,
      });
      return;
    }

    setCoords({
      style: {
        top: `${result.top}px`,
        left: `${result.left}px`,
        maxHeight: result.maxHeight === null ? undefined : `${result.maxHeight}px`,
      },
      placement: result.placement,
      arrowTop: result.arrowTop,
      arrowLeft: result.arrowLeft,
      maxHeight: result.maxHeight,
    });
  }, [anchorRect, editingOccurrence, getAnchorElement, isOpen, popoverRef]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition, mode, errorMessage]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // The page entrance and calendar view changes slide the event while the card is open.
  useFollowAnchorMotion(isOpen, getAnchorElement, updatePosition);

  return coords;
}
