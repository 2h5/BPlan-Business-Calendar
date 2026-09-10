import { createCalendarSchema, type Calendar, type CreateCalendarInput } from '@cal/schemas';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import styles from './CalendarView.module.css';

interface CalendarEditorProps {
  calendar: Calendar | null;
  onClose: () => void;
  onCreate: (input: CreateCalendarInput) => Promise<void>;
  onUpdate: (calendar: Calendar, input: CreateCalendarInput) => Promise<void>;
  onDelete: (calendar: Calendar) => Promise<void>;
}

export function CalendarEditor({
  calendar,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: CalendarEditorProps) {
  const [name, setName] = useState(calendar?.name ?? '');
  const [color, setColor] = useState(calendar?.color ?? '#8AA4FF');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const deleteWrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closingTimeoutRef = useRef<number | null>(null);
  const isProvider = !!calendar && calendar.sourceType !== 'internal';

  useEffect(() => {
    if (!isConfirmOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!deleteWrapperRef.current?.contains(e.target as Node)) {
        setIsConfirmOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isConfirmOpen]);

  const requestClose = useCallback(() => {
    if (isClosing || isSaving) return;
    setIsClosing(true);
  }, [isClosing, isSaving]);

  const handleAnimationEnd = (event: React.AnimationEvent) => {
    if (isClosing && event.target === panelRef.current) {
      if (closingTimeoutRef.current) window.clearTimeout(closingTimeoutRef.current);
      onClose();
    }
  };

  useEffect(() => {
    if (isClosing) {
      closingTimeoutRef.current = window.setTimeout(() => {
        onClose();
      }, 180);
      return () => {
        if (closingTimeoutRef.current) window.clearTimeout(closingTimeoutRef.current);
      };
    }
  }, [isClosing, onClose]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving && !isClosing) requestClose();
      if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled)',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isClosing, isSaving, requestClose]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isProvider || isClosing) return;
    try {
      setError(null);
      setIsSaving(true);
      const input = createCalendarSchema.parse({
        name,
        color,
        isVisible: calendar?.isVisible ?? true,
        isDefault: calendar?.isDefault ?? false,
      });
      if (calendar) await onUpdate(calendar, input);
      else await onCreate(input);
      requestClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The calendar could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!calendar || isProvider || isClosing) return;
    try {
      setError(null);
      setIsSaving(true);
      await onDelete(calendar);
      requestClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The calendar could not be deleted.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.modalLayer} role="presentation">
      <button
        className={`${styles.modalBackdrop} ${isClosing ? styles.modalBackdropClosing : ''}`}
        type="button"
        onClick={requestClose}
        aria-label="Close"
      />
      <section
        ref={panelRef}
        className={`${styles.calendarEditor} ${isClosing ? styles.calendarEditorClosing : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-editor-title"
        onAnimationEnd={handleAnimationEnd}
      >
        <div className={styles.editorHeader}>
          <div>
            <span className={styles.eyebrow}>Calendar settings</span>
            <strong id="calendar-editor-title">{calendar ? calendar.name : 'New calendar'}</strong>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <form className={styles.calendarEditorBody} onSubmit={handleSubmit}>
          {isProvider ? (
            <div className={styles.infoBanner}>
              Name, color, and removal are managed by {calendar.sourceType}. Visibility can still be
              changed from the calendar list.
            </div>
          ) : null}
          {error ? (
            <div className={styles.errorBanner} role="alert">
              {error}
            </div>
          ) : null}
          <div className={styles.editorField}>
            <label htmlFor="calendar-name">Name</label>
            <input
              id="calendar-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              autoFocus={!isProvider}
              disabled={isProvider || isClosing}
            />
          </div>
          <div className={styles.editorField}>
            <label htmlFor="calendar-color">Color</label>
            <div className={styles.colorField}>
              <div className={styles.colorPickerWrap}>
                <input
                  id="calendar-color"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value.toUpperCase())}
                  disabled={isProvider || isClosing}
                  aria-label="Select calendar color"
                />
              </div>
              <span className={styles.colorHexBadge}>{color}</span>
            </div>
          </div>
          {calendar?.isDefault ? (
            <div className={styles.infoBanner}>
              This is your default calendar and cannot be deleted.
            </div>
          ) : null}
          <div className={styles.editorFooter}>
            {calendar && !isProvider && !calendar.isDefault ? (
              <div ref={deleteWrapperRef} className={styles.deleteWrapper}>
                <button
                  type="button"
                  className={`${styles.deleteButton} ${isConfirmOpen ? styles.deleteButtonActive : ''}`}
                  disabled={isSaving || isClosing}
                  onClick={() => setIsConfirmOpen(true)}
                  aria-expanded={isConfirmOpen}
                  aria-haspopup="dialog"
                >
                  Delete calendar
                </button>

                {isConfirmOpen && (
                  <div
                    className={styles.deleteConfirmPopup}
                    role="dialog"
                    aria-label="Confirm calendar deletion"
                  >
                    <div className={styles.deleteConfirmContent}>
                      <span className={styles.deleteConfirmTitle}>Delete this calendar?</span>
                      <span className={styles.deleteConfirmDesc}>
                        Delete {calendar.name} and all of its events? This action cannot be undone.
                      </span>
                    </div>
                    <div className={styles.deleteConfirmActions}>
                      <button
                        type="button"
                        className={styles.deleteConfirmCancelBtn}
                        onClick={() => setIsConfirmOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.deleteConfirmBtn}
                        onClick={() => {
                          setIsConfirmOpen(false);
                          void handleDelete();
                        }}
                        disabled={isSaving}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span />
            )}
            <div>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={requestClose}
                disabled={isSaving || isClosing}
              >
                {isProvider ? 'Close' : 'Cancel'}
              </button>
              {!isProvider ? (
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isSaving || isClosing || !name.trim()}
                >
                  {isSaving ? 'Saving…' : calendar ? 'Save calendar' : 'Create calendar'}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
