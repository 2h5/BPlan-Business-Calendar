import { createCalendarSchema, type Calendar, type CreateCalendarInput } from '@cal/schemas';
import { useEffect, useRef, useState, type FormEvent } from 'react';

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
  const panelRef = useRef<HTMLElement>(null);
  const isProvider = !!calendar && calendar.sourceType !== 'internal';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
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
  }, [isSaving, onClose]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isProvider) return;
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
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The calendar could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!calendar || isProvider) return;
    if (!window.confirm(`Delete ${calendar.name} and all of its events? This cannot be undone.`)) {
      return;
    }
    try {
      setError(null);
      setIsSaving(true);
      await onDelete(calendar);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The calendar could not be deleted.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.modalLayer} role="presentation">
      <button className={styles.modalBackdrop} type="button" onClick={onClose} aria-label="Close" />
      <section
        ref={panelRef}
        className={styles.calendarEditor}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-editor-title"
      >
        <div className={styles.editorHeader}>
          <div>
            <span className={styles.eyebrow}>Calendar settings</span>
            <strong id="calendar-editor-title">{calendar ? calendar.name : 'New calendar'}</strong>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
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
              disabled={isProvider}
            />
          </div>
          <div className={styles.editorField}>
            <label htmlFor="calendar-color">Color</label>
            <div className={styles.colorField}>
              <input
                id="calendar-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value.toUpperCase())}
                disabled={isProvider}
              />
              <span>{color}</span>
            </div>
          </div>
          {calendar?.isDefault ? (
            <div className={styles.infoBanner}>
              This is your default calendar and cannot be deleted.
            </div>
          ) : null}
          <div className={styles.editorFooter}>
            {calendar && !isProvider && !calendar.isDefault ? (
              <button
                type="button"
                className={styles.deleteButton}
                disabled={isSaving}
                onClick={() => void handleDelete()}
              >
                Delete calendar
              </button>
            ) : (
              <span />
            )}
            <div>
              <button type="button" className={styles.secondaryButton} onClick={onClose}>
                {isProvider ? 'Close' : 'Cancel'}
              </button>
              {!isProvider ? (
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isSaving || !name.trim()}
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
