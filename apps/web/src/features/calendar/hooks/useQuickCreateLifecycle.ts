import { useCallback, useEffect, useState, type AnimationEvent, type RefObject } from 'react';

interface UseQuickCreateLifecycleOptions {
  isOpen: boolean;
  isSaving: boolean;
  isDeleteConfirmOpen: boolean;
  setIsDeleteConfirmOpen: (isOpen: boolean) => void;
  popoverRef: RefObject<HTMLDivElement | null>;
  titleInputRef: RefObject<HTMLInputElement | null>;
  onClosing?: () => void;
  onClose: () => void;
}

/**
 * True when Escape is aimed at an open Select or picker inside the popover:
 * focus is on its expanded trigger, or in its menu (pickers portal their menu
 * outside the popover). That control closes itself on Escape, so this capture
 * listener must let the key through instead of closing the whole popover.
 */
function isNestedPopupTarget(target: EventTarget | null, popover: HTMLElement | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  if (target.getAttribute('aria-expanded') === 'true') return true;
  return !popover?.contains(target) && target.closest('[role="dialog"], [role="listbox"]') !== null;
}

export function useQuickCreateLifecycle({
  isOpen,
  isSaving,
  isDeleteConfirmOpen,
  setIsDeleteConfirmOpen,
  popoverRef,
  titleInputRef,
  onClosing,
  onClose,
}: UseQuickCreateLifecycleOptions) {
  // Autofocus title input when popover opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        titleInputRef.current?.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, titleInputRef]);

  const [isClosing, setIsClosing] = useState(false);

  const handleRequestClose = useCallback(() => {
    if (isSaving || isClosing) return;
    setIsClosing(true);
    onClosing?.();
  }, [isSaving, isClosing, onClosing]);

  const handleAnimationEnd = (e: AnimationEvent) => {
    if (isClosing && e.target === popoverRef.current) {
      setIsClosing(false);
      onClose();
    }
  };

  // Keyboard navigation & Escape key & focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        if (!isDeleteConfirmOpen && isNestedPopupTarget(e.target, popoverRef.current)) return;
        e.stopPropagation();
        if (isDeleteConfirmOpen) {
          e.preventDefault();
          setIsDeleteConfirmOpen(false);
          return;
        }
        handleRequestClose();
      }

      if (e.key === 'Tab' && popoverRef.current) {
        const focusable = popoverRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    isDeleteConfirmOpen,
    isOpen,
    isSaving,
    handleRequestClose,
    setIsDeleteConfirmOpen,
    popoverRef,
  ]);

  return { isClosing, handleRequestClose, handleAnimationEnd };
}
