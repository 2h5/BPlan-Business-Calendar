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
