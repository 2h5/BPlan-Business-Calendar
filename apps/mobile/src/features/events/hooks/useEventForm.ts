import type { CalendarEvent } from '@cal/schemas';
import { useCallback, useEffect, useState } from 'react';

import { eventFormFrom, newEventForm, type EventFormState } from '../utils/event-form';

export interface UseEventFormOptions {
  visible: boolean;
  eventId: string | null;
  /** The event being edited, once loaded; ignored for a new event. */
  existing: CalendarEvent | undefined;
  seedStart: Date | null;
  seedDateKey: string | null;
  timeZone: string;
  defaultCalendarId: string | null;
  defaultDurationMinutes: number;
}

export interface EventForm {
  /** NULL until the editor has something to show (an existing event still loading). */
  form: EventFormState | null;
  patch: (next: Partial<EventFormState>) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

/**
 * The event editor's working copy. It is rebuilt each time the editor opens —
 * blank and seeded for a new event, or from the loaded event when editing —
 * so a cancelled edit never leaks into the next one.
 */
export function useEventForm({
  visible,
  eventId,
  existing,
  seedStart,
  seedDateKey,
  timeZone,
  defaultCalendarId,
  defaultDurationMinutes,
}: UseEventFormOptions): EventForm {
  const [form, setForm] = useState<EventFormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    if (!eventId) {
      setForm(
        newEventForm({
          seedStart,
          seedDateKey,
          timeZone,
          calendarId: defaultCalendarId,
          durationMinutes: defaultDurationMinutes,
        }),
      );
      setError(null);
      return;
    }

    if (existing) {
      setForm(eventFormFrom(existing));
      setError(null);
    }
  }, [
    visible,
    eventId,
    existing,
    seedStart,
    seedDateKey,
    timeZone,
    defaultCalendarId,
    defaultDurationMinutes,
  ]);

  const patch = useCallback(
    (next: Partial<EventFormState>) =>
      setForm((previous) => (previous ? { ...previous, ...next } : previous)),
    [],
  );

  return { form, patch, error, setError };
}
