import { describeRRule, parseRRule, RECURRENCE_PRESETS } from '@cal/domain';
import type { Calendar, CalendarEvent } from '@cal/schemas';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import styles from './CalendarView.module.css';
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
  selectedDateKey: string;
  calendars: readonly Calendar[];
  timeZone: string;
  defaultDurationMinutes: number;
  isSaving: boolean;
  onClose: () => void;
  onCreate: (input: ReturnType<typeof eventInputFromForm>) => Promise<void>;
  onUpdate: (event: CalendarEvent, input: ReturnType<typeof eventInputFromForm>) => Promise<void>;
  onDelete: (event: CalendarEvent) => Promise<void>;
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
  selectedDateKey,
  calendars,
  timeZone,
  defaultDurationMinutes,
  isSaving,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: EventEditorProps) {
  const event = occurrence?.event ?? null;
  const defaultCalendar =
    calendars.find((calendar) => calendar.isDefault && !calendar.isReadOnly) ??
    calendars.find((calendar) => !calendar.isReadOnly);
  const [form, setForm] = useState<EventFormValues | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const availableCalendars = useMemo(() => writableCalendars(calendars, event), [calendars, event]);
  const currentCalendar = calendars.find((calendar) => calendar.id === event?.calendarId);
  const readOnly = !!event && (!currentCalendar || currentCalendar.isReadOnly);
  const providerOwned = !!event && event.sourceType !== 'internal';

  useEffect(() => {
    setMessage(null);
    if (event) {
      setForm(eventToFormValues(event, timeZone));
    } else if (isDraft && defaultCalendar) {
      setForm(
        newEventFormValues(selectedDateKey, defaultCalendar.id, timeZone, defaultDurationMinutes),
      );
    } else {
      setForm(null);
    }
  }, [defaultCalendar, defaultDurationMinutes, event, isDraft, selectedDateKey, timeZone]);

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
      const input = eventInputFromForm(form, timeZone);
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
    const scope = event.recurrenceRule && !event.recurringEventId ? ' recurring series' : ' event';
    if (!window.confirm(`Delete this${scope}? This cannot be undone.`)) return;
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
      className={styles.eventEditor}
      aria-label={isDraft ? 'Create event' : 'Event inspector'}
    >
      <div className={styles.editorHeader}>
        <div>
          <span className={styles.eyebrow}>{isDraft ? 'New event' : 'Event inspector'}</span>
          <span className={styles.editorSubtitle}>
            {readOnly
              ? 'View only'
              : providerOwned
                ? `Changes are saved to ${event.sourceType} first`
                : 'BCal calendar event'}
          </span>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close event editor"
          title="Close (Esc)"
        >
          ×
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
            id="event-title"
            value={form.title}
            onChange={(changeEvent) => set('title', changeEvent.target.value)}
            placeholder="Event title"
            maxLength={300}
            required
            autoFocus={!readOnly}
            disabled={readOnly}
          />
        </div>

        <div className={styles.editorField}>
          <label htmlFor="event-calendar">Calendar</label>
          <select
            id="event-calendar"
            value={form.calendarId}
            onChange={(changeEvent) => set('calendarId', changeEvent.target.value)}
            disabled={readOnly || availableCalendars.length <= 1}
          >
            {availableCalendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}{' '}
                {calendar.sourceType === 'internal' ? '' : `(${calendar.sourceType})`}
              </option>
            ))}
          </select>
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
          <select
            id="event-repeat"
            value={presetMatch ? (form.recurrenceRule ?? '') : 'custom'}
            onChange={(changeEvent) => set('recurrenceRule', changeEvent.target.value || null)}
            disabled={readOnly || !!event?.recurringEventId}
          >
            {RECURRENCE_PRESETS.map((preset) => (
              <option key={preset.label} value={preset.rrule ?? ''}>
                {preset.label}
              </option>
            ))}
            {!presetMatch ? <option value="custom">Existing custom rule</option> : null}
          </select>
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
          Times are stored in UTC and shown in {timeZone.replaceAll('_', ' ')}.
        </div>

        <div className={styles.editorFooter}>
          {event && !readOnly ? (
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => void handleDelete()}
              disabled={isSaving}
            >
              {providerOwned ? `Delete from ${event.sourceType}` : 'Delete event'}
            </button>
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
    </aside>
  );
}
