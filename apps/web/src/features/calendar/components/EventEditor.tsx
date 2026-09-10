import { describeRRule, parseRRule, RECURRENCE_PRESETS } from '@cal/domain';
import type { Calendar, CalendarEvent } from '@cal/schemas';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import styles from './CalendarView.module.css';
import { Select } from '../../../components/forms/Select';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import {
  eventInputFromForm,
  eventToFormValues,
  newEventFormValues,
  type EventFormValues,
} from '../utils/event-form';

interface EventEditorProps {
  occurrence: EventOccurrence | null;
  isDraft: boolean;
  isClosing: boolean;
  selectedDateKey: string;
  calendars: readonly Calendar[];
  timeZone: string;
  defaultDurationMinutes: number;
  isSaving: boolean;
  onClose: () => void;
  onCloseAnimationEnd: () => void;
  onCreate: (input: ReturnType<typeof eventInputFromForm>) => Promise<void>;
  onUpdate: (event: CalendarEvent, input: ReturnType<typeof eventInputFromForm>) => Promise<void>;
  onDelete: (event: CalendarEvent) => Promise<void>;
  initialFormValues?: Partial<EventFormValues> | null;
}

function writableCalendars(
  calendars: readonly Calendar[],
  event: CalendarEvent | null,
): Calendar[] {
  if (!event) return calendars.filter((calendar) => !calendar.isReadOnly);
  const current = calendars.find((calendar) => calendar.id === event.calendarId);
  if (!current || current.isReadOnly) return current ? [current] : [];
  if (current.sourceType !== 'internal') return [current];
  return calendars.filter((calendar) => calendar.sourceType === 'internal' && !calendar.isReadOnly);
}

export function EventEditor({
  occurrence,
  isDraft,
  isClosing,
  selectedDateKey,
  calendars,
  timeZone,
  defaultDurationMinutes,
  isSaving,
  onClose,
  onCloseAnimationEnd,
  onCreate,
  onUpdate,
  onDelete,
  initialFormValues,
}: EventEditorProps) {
  const event = occurrence?.event ?? null;
  const defaultCalendar =
    calendars.find((calendar) => calendar.isDefault && !calendar.isReadOnly) ??
    calendars.find((calendar) => !calendar.isReadOnly);
  const [form, setForm] = useState<EventFormValues | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const deleteWrapperRef = useRef<HTMLDivElement>(null);

  const availableCalendars = useMemo(() => writableCalendars(calendars, event), [calendars, event]);
  const currentCalendar = calendars.find((calendar) => calendar.id === event?.calendarId);
  const readOnly = !!event && (!currentCalendar || currentCalendar.isReadOnly);
  const providerOwned = !!event && event.sourceType !== 'internal';
  const eventTimeZone = event?.timezone ?? timeZone;
  const editorClassName = `${styles.eventEditor} ${isClosing ? styles.eventEditorClosing : ''}`;
  const handleAnimationEnd = isClosing ? onCloseAnimationEnd : undefined;

  // Close confirmation if event selection changes
  useEffect(() => {
    setIsConfirmOpen(false);
  }, [event?.id]);

  // Click outside and escape handling for delete confirmation popup
  useEffect(() => {
    if (!isConfirmOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!deleteWrapperRef.current?.contains(e.target as Node)) {
        setIsConfirmOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsConfirmOpen(false);
        e.stopPropagation();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isConfirmOpen]);

  // Focus title input smoothly after entry animation completes (or on mount)
  useEffect(() => {
    if (isDraft && !readOnly) {
      const timer = setTimeout(() => {
        titleInputRef.current?.focus({ preventScroll: true });
      }, 230);
      return () => clearTimeout(timer);
    }
  }, [isDraft, readOnly]);

  useEffect(() => {
    setMessage(null);
    if (event) {
      setForm(eventToFormValues(event));
    } else if (isDraft && defaultCalendar) {
      const baseValues = newEventFormValues(
        selectedDateKey,
        defaultCalendar.id,
        timeZone,
        defaultDurationMinutes,
      );
      setForm(initialFormValues ? { ...baseValues, ...initialFormValues } : baseValues);
    } else {
      setForm(null);
    }
  }, [
    defaultCalendar,
    defaultDurationMinutes,
    event,
    initialFormValues,
    isDraft,
    selectedDateKey,
    timeZone,
  ]);

  useEffect(() => {
    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape' && !isSaving) onClose();
      if (keyboardEvent.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (keyboardEvent.shiftKey && document.activeElement === first) {
          keyboardEvent.preventDefault();
          last?.focus();
        } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
          keyboardEvent.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose]);

  if (!form) return null;

  const set = <Key extends keyof EventFormValues>(key: Key, value: EventFormValues[Key]) => {
    setMessage(null);
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const handleSubmit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (readOnly) return;
    try {
      setMessage(null);
      const input = eventInputFromForm(form, timeZone, event);
      if (event) await onUpdate(event, input);
      else await onCreate(input);
      setMessage({ tone: 'success', text: event ? 'Event updated.' : 'Event created.' });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'The event could not be saved.',
      });
    }
  };

  const handleDelete = async () => {
    if (!event || readOnly) return;
    try {
      setMessage(null);
      await onDelete(event);
      onClose();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'The event could not be deleted.',
      });
    }
  };

  const parsedRule = form.recurrenceRule ? parseRRule(form.recurrenceRule) : null;
  const presetMatch = RECURRENCE_PRESETS.some((preset) => preset.rrule === form.recurrenceRule);

  return (
    <aside
      ref={panelRef}
      className={editorClassName}
      aria-label={isDraft ? 'Create event' : 'Calendar event'}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className={styles.editorInner}>
        <div className={styles.editorHeader}>
          <div>
            <span className={styles.eyebrow}>{isDraft ? 'New event' : 'Calendar event'}</span>
            <span className={styles.editorSubtitle}>
              {readOnly
                ? 'View only'
                : providerOwned
                  ? `Changes are saved to ${event.sourceType} first`
                  : 'BPlan calendar event'}
            </span>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close event editor"
            title="Close (Esc)"
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

        <form className={styles.editorBody} onSubmit={handleSubmit}>
          {readOnly ? (
            <div className={styles.infoBanner} role="status">
              {currentCalendar?.name ?? 'This calendar'} is read only. Manage this event in its
              provider.
            </div>
          ) : null}
          {message ? (
            <div
              className={message.tone === 'error' ? styles.errorBanner : styles.successBanner}
              role={message.tone === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </div>
          ) : null}
          {event && event.syncStatus !== 'synced' ? (
            <div className={styles.errorBanner} role="status">
              {event.syncStatus === 'conflict'
                ? 'This event changed at the provider. Refresh before trying another edit.'
                : 'The last provider write did not finish. The local copy has not replaced provider data.'}
            </div>
          ) : null}
          {event?.recurringEventId ? (
            <div className={styles.infoBanner}>
              This provider exception edits only this occurrence.
            </div>
          ) : event?.recurrenceRule ? (
            <div className={styles.infoBanner}>Edits and deletion apply to the entire series.</div>
          ) : null}

          <div className={styles.editorField}>
            <label htmlFor="event-title">Title</label>
            <input
              ref={titleInputRef}
              id="event-title"
              value={form.title}
              onChange={(changeEvent) => set('title', changeEvent.target.value)}
              placeholder="Event title"
              maxLength={300}
              required
              disabled={readOnly}
            />
          </div>

          <div className={styles.editorField}>
            <label htmlFor="event-calendar">Calendar</label>
            <Select
              id="event-calendar"
              value={form.calendarId}
              options={availableCalendars.map((calendar) => ({
                value: calendar.id,
                label: `${calendar.name}${calendar.sourceType === 'internal' ? '' : ` (${calendar.sourceType})`}`,
              }))}
              onChange={(value) => set('calendarId', value)}
              disabled={readOnly || availableCalendars.length <= 1}
              ariaLabel="Calendar"
            />
          </div>

          <label className={styles.allDayToggle}>
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(changeEvent) => set('allDay', changeEvent.target.checked)}
              disabled={readOnly}
            />
            <span>All-day event</span>
          </label>

          <fieldset className={styles.dateTimeFields} disabled={readOnly}>
            <legend>Date and time</legend>
            <label>
              <span>Starts</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(changeEvent) => set('startDate', changeEvent.target.value)}
                required
              />
            </label>
            {!form.allDay ? (
              <label>
                <span>Start time</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(changeEvent) => set('startTime', changeEvent.target.value)}
                  required
                />
              </label>
            ) : null}
            <label>
              <span>Ends</span>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(changeEvent) => set('endDate', changeEvent.target.value)}
                required
              />
            </label>
            {!form.allDay ? (
              <label>
                <span>End time</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(changeEvent) => set('endTime', changeEvent.target.value)}
                  required
                />
              </label>
            ) : null}
          </fieldset>

          <div className={styles.editorField}>
            <label htmlFor="event-repeat">Repeat</label>
            <Select
              id="event-repeat"
              value={presetMatch ? (form.recurrenceRule ?? '') : 'custom'}
              options={[
                ...RECURRENCE_PRESETS.map((preset) => ({
                  value: preset.rrule ?? '',
                  label: preset.label,
                })),
                ...(!presetMatch ? [{ value: 'custom', label: 'Existing custom rule' }] : []),
              ]}
              onChange={(value) => set('recurrenceRule', value || null)}
              disabled={readOnly || !!event?.recurringEventId}
              ariaLabel="Repeat"
            />
            {form.recurrenceRule ? (
              <small>
                {parsedRule
                  ? describeRRule(parsedRule)
                  : 'This rule is not editable here and will be preserved unless replaced.'}
              </small>
            ) : null}
          </div>

          <div className={styles.editorField}>
            <label htmlFor="event-location">Location</label>
            <input
              id="event-location"
              value={form.location}
              onChange={(changeEvent) => set('location', changeEvent.target.value)}
              placeholder="Add a location"
              maxLength={500}
              disabled={readOnly}
            />
          </div>

          <div className={styles.editorField}>
            <label htmlFor="event-description">Description</label>
            <textarea
              id="event-description"
              value={form.description}
              onChange={(changeEvent) => set('description', changeEvent.target.value)}
              placeholder="Add notes or context"
              maxLength={10_000}
              disabled={readOnly}
            />
          </div>

          <div className={styles.editorMeta}>
            Times are stored in UTC and shown in {eventTimeZone.replaceAll('_', ' ')}.
          </div>

          <div className={styles.editorFooter}>
            {event && !readOnly ? (
              <div ref={deleteWrapperRef} className={styles.deleteWrapper}>
                <button
                  type="button"
                  className={`${styles.deleteButton} ${isConfirmOpen ? styles.deleteButtonActive : ''}`}
                  onClick={() => setIsConfirmOpen(true)}
                  disabled={isSaving}
                  aria-expanded={isConfirmOpen}
                  aria-haspopup="dialog"
                >
                  {providerOwned ? `Delete from ${event.sourceType}` : 'Delete event'}
                </button>

                {isConfirmOpen && (
                  <div
                    className={styles.deleteConfirmPopup}
                    role="dialog"
                    aria-label="Confirm event deletion"
                  >
                    <div className={styles.deleteConfirmContent}>
                      <span className={styles.deleteConfirmTitle}>
                        {event.recurrenceRule && !event.recurringEventId
                          ? 'Delete recurring series?'
                          : 'Delete this event?'}
                      </span>
                      <span className={styles.deleteConfirmDesc}>
                        {providerOwned
                          ? `This will remove the event from ${event.sourceType}.`
                          : 'This action cannot be undone.'}
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
              <button type="button" className={styles.secondaryButton} onClick={onClose}>
                {readOnly ? 'Close' : 'Cancel'}
              </button>
              {!readOnly ? (
                <button
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isSaving || !form.title.trim() || !form.calendarId}
                >
                  {isSaving ? 'Saving…' : event ? 'Save changes' : 'Create event'}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
}
