import {
  type Calendar,
  type CalendarEvent,
  type CreateCalendarInput,
  type CreateEventInput,
  type Profile,
  type UpdateCalendarInput,
  type UpdateEventInput,
  createCalendarSchema,
  createEventSchema,
  updateCalendarSchema,
  updateEventSchema,
} from '@cal/schemas';
import type { TablesUpdate } from '@cal/types';
import { z } from 'zod';

import { calendarRowSchema, eventRowSchema, profileRowSchema } from './calendar-mappers';
import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

export const EVENT_COLUMNS =
  'id, user_id, calendar_id, title, description, location, start_at, end_at, all_day, ' +
  'timezone, status, recurrence_rule, alerts, source_type, provider_event_id, provider_etag, ' +
  'recurring_event_id, recurrence_original_start_at, provider_updated_at, sync_status, ' +
  'created_at, updated_at';

export async function fetchCalendars(): Promise<Calendar[]> {
  const { data, error } = await supabase
    .from('calendars')
    .select('*')
    .order('is_default', { ascending: false })
    .order('name');

  if (error) throw toAppError(error);
  return (data ?? []).map((row) => calendarRowSchema.parse(row));
}

export async function fetchCalendarProfile(): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').single();
  if (error) throw toAppError(error);
  return profileRowSchema.parse(data);
}

export async function createCalendar(
  input: CreateCalendarInput,
  userId: string,
): Promise<Calendar> {
  const parsed = createCalendarSchema.parse(input);
  const { data, error } = await supabase
    .from('calendars')
    .insert({
      user_id: userId,
      name: parsed.name,
      color: parsed.color,
      is_visible: parsed.isVisible,
      is_default: parsed.isDefault,
    })
    .select('*')
    .single();

  if (error) throw toAppError(error);
  return calendarRowSchema.parse(data);
}

export async function updateCalendar(id: string, input: UpdateCalendarInput): Promise<Calendar> {
  const parsed = updateCalendarSchema.parse(input);
  const payload: TablesUpdate<'calendars'> = {};
  if (parsed.name !== undefined) payload.name = parsed.name;
  if (parsed.color !== undefined) payload.color = parsed.color;
  if (parsed.isVisible !== undefined) payload.is_visible = parsed.isVisible;
  if (parsed.isDefault !== undefined) payload.is_default = parsed.isDefault;

  const { data, error } = await supabase
    .from('calendars')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toAppError(error);
  return calendarRowSchema.parse(data);
}

export async function updateCalendarVisibility(id: string, isVisible: boolean): Promise<void> {
  const { error } = await supabase.from('calendars').update({ is_visible: isVisible }).eq('id', id);
  if (error) throw toAppError(error);
}

export async function deleteCalendar(id: string): Promise<void> {
  const { error } = await supabase.from('calendars').delete().eq('id', id);
  if (error) throw toAppError(error);
}

/**
 * Fetch rows that can contribute an occurrence to one bounded view window.
 * Recurring masters are intentionally included even when their original start
 * is older than the window; `recurrence_rule` is opaque text here, so the API
 * cannot safely derive a series end without risking valid finite or provider
 * exception occurrences. @cal/domain expands them and applies exceptions.
 */
export async function fetchEventsInWindow(start: Date, end: Date): Promise<CalendarEvent[]> {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const maxWindowMs = 46 * 24 * 60 * 60_000;

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new RangeError('Calendar event window must have valid increasing dates');
  }
  if (endMs - startMs > maxWindowMs) {
    throw new RangeError('Calendar event window cannot exceed 46 days');
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .or(
      `and(status.neq.cancelled,start_at.lt.${endIso},end_at.gt.${startIso}),` +
        'recurrence_rule.not.is.null,' +
        `and(recurring_event_id.not.is.null,recurrence_original_start_at.gte.${startIso},` +
        `recurrence_original_start_at.lt.${endIso})`,
    )
    .order('start_at');

  if (error) throw toAppError(error);
  return (data ?? []).map((row) => eventRowSchema.parse(row));
}

export async function createEvent(input: CreateEventInput, userId: string): Promise<CalendarEvent> {
  const parsed = createEventSchema.parse(input);
  const { data, error } = await supabase
    .from('events')
    .insert({
      user_id: userId,
      calendar_id: parsed.calendarId,
      title: parsed.title,
      description: parsed.description ?? null,
      location: parsed.location ?? null,
      start_at: parsed.startAt,
      end_at: parsed.endAt,
      all_day: parsed.allDay,
      timezone: parsed.timezone,
      recurrence_rule: parsed.recurrenceRule ?? null,
      alerts: parsed.alerts,
    })
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw toAppError(error);
  return eventRowSchema.parse(data);
}

export async function updateEvent(input: UpdateEventInput): Promise<CalendarEvent> {
  const parsed = updateEventSchema.parse(input);
  const { id, ...patch } = parsed;
  const payload: TablesUpdate<'events'> = {};
  if (patch.calendarId !== undefined) payload.calendar_id = patch.calendarId;
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.location !== undefined) payload.location = patch.location;
  if (patch.startAt !== undefined) payload.start_at = patch.startAt;
  if (patch.endAt !== undefined) payload.end_at = patch.endAt;
  if (patch.allDay !== undefined) payload.all_day = patch.allDay;
  if (patch.timezone !== undefined) payload.timezone = patch.timezone;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.recurrenceRule !== undefined) payload.recurrence_rule = patch.recurrenceRule;
  if (patch.alerts !== undefined) payload.alerts = patch.alerts;

  const { data, error } = await supabase
    .from('events')
    .update(payload)
    .eq('id', id)
    .select(EVENT_COLUMNS)
    .single();
  if (error) throw toAppError(error);
  return eventRowSchema.parse(data);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw toAppError(error);
}

export type ProviderEventDraft = Omit<CreateEventInput, 'calendarId'>;
export type ProviderEventWrite =
  | { operation: 'create'; calendarId: string; draft: ProviderEventDraft }
  | { operation: 'update'; eventId: string; draft: ProviderEventDraft }
  | { operation: 'delete'; eventId: string };

/** Provider-owned writes always go through the provider-first Edge Function. */
export async function writeProviderEvent(input: ProviderEventWrite): Promise<void> {
  const { data, error } = await supabase.functions.invoke<
    { eventId: string | null } | { error?: unknown }
  >('provider-event-write', { body: input });

  if (error) {
    const context = 'context' in error ? error.context : null;
    let envelope: unknown = null;
    if (context instanceof Response)
      envelope = await context
        .clone()
        .json()
        .catch(() => null);
    const failure = providerErrorSchema.safeParse(envelope);
    throw toAppError(failure.success ? failure.data.error : error);
  }

  const failure = providerErrorSchema.safeParse(data);
  if (failure.success) throw toAppError(failure.data.error);
}

const providerErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
