import type { Calendar, CalendarEvent, CreateEventInput } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { useCalendars } from './useCalendars';
import { queryKeys } from '../../../lib/query/query-client';
import { useAuth, useRequiredUserId } from '../../auth';
import {
  writeProviderEvent,
  type ProviderEventDraft,
} from '../../integrations/api/integrations.api';
import {
  createEvent,
  deleteEvent,
  fetchEvent,
  fetchEventsInWindow,
  updateEvent,
} from '../api/events.api';

/**
 * Events for a time window.
 *
 * The window is part of the query key, so panning the calendar produces cache
 * hits for ranges already visited rather than a refetch. Master rows for
 * recurring series come back with every window and are expanded downstream.
 */
export function useEventsInWindow(start: Date, end: Date) {
  const { isAuthenticated } = useAuth();
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  return useQuery({
    queryKey: queryKeys.events.window(startIso, endIso),
    queryFn: () => fetchEventsInWindow(new Date(startIso), new Date(endIso)),
    enabled: isAuthenticated,
    // Keep the previous window on screen while the next one loads, so panning
    // does not flash an empty calendar.
    placeholderData: (previous) => previous,
  });
}

export function useEvent(id: string | null) {
  return useQuery({
    queryKey: queryKeys.events.detail(id ?? 'none'),
    queryFn: () => fetchEvent(id as string),
    enabled: !!id,
  });
}

/** Any event mutation can affect any cached window, so invalidate them all. */
function useInvalidateEvents() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
}

/**
 * Which calendars this database owns, and which a provider owns.
 *
 * Every mutation below asks this first, because the answer changes where the
 * write goes: an internal calendar is written straight to Postgres, and a
 * synced one has to go out to the provider before anything is stored locally
 * (`docs/architecture.md` § Decision A).
 */
function useCalendarSourceLookup() {
  const { data: calendars } = useCalendars();

  return (calendarId: string | undefined): Calendar | undefined =>
    calendars?.find((calendar) => calendar.id === calendarId);
}

/** The editor's fields, in the shape the provider write path expects. */
function toDraft(input: CreateEventInput): ProviderEventDraft {
  return {
    title: input.title,
    description: input.description ?? null,
    location: input.location ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    timezone: input.timezone,
    recurrenceRule: input.recurrenceRule ?? null,
    alerts: input.alerts,
  };
}

/**
 * Event colour is an app-only display preference. Provider writes deliberately
 * omit it, so persist the preference after the provider has accepted the event
 * and the local mirror has an id.
 */
async function persistLocalColor(
  eventId: string | null,
  color: string | null | undefined,
): Promise<void> {
  if (!eventId || color === undefined) return;
  await updateEvent({ id: eventId, color });
}

export function useCreateEvent() {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateEvents();
  const calendarFor = useCalendarSourceLookup();

  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const calendar = calendarFor(input.calendarId);

      if (calendar && calendar.sourceType !== 'internal') {
        const result = await writeProviderEvent({
          operation: 'create',
          calendarId: input.calendarId,
          draft: toDraft(input),
        });
        await persistLocalColor(result.eventId, input.color);
        return;
      }

      await createEvent(input, userId);
    },
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onSettled: () => void invalidate(),
  });
}

/**
 * The editor always holds every field, so an update carries the whole event
 * rather than a patch. A provider write replaces the event's fields outright,
 * and a partial patch could not express that faithfully.
 */
export type UpdateEventPayload = CreateEventInput & { id: string };

export function useUpdateEvent() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEvents();
  const calendarFor = useCalendarSourceLookup();

  return useMutation({
    mutationFn: async (input: UpdateEventPayload) => {
      const calendar = calendarFor(input.calendarId);

      if (calendar && calendar.sourceType !== 'internal') {
        const result = await writeProviderEvent({
          operation: 'update',
          eventId: input.id,
          draft: toDraft(input),
        });
        await persistLocalColor(result.eventId, input.color);
        return;
      }

      const event = await updateEvent(input);
      queryClient.setQueryData(queryKeys.events.detail(event.id), event);
    },
    onSettled: () => void invalidate(),
  });
}

export interface MoveEventPayload {
  event: CalendarEvent;
  /** The dragged-to time, as UTC ISO strings. */
  startAt: string;
  endAt: string;
}

/**
 * Re-time one event, as a drag on the calendar does.
 *
 * Distinct from `useUpdateEvent` in two ways. It carries only the times, since
 * a drag changes nothing else and the editor — the only holder of the whole
 * event — is not open. And it writes to the cache first: a drag ends with the
 * chip already under the finger, so waiting for the round trip would snap it
 * back to the old time for as long as the network took, which reads as the
 * drag having failed.
 */
export function useMoveEvent() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateEvents();
  const calendarFor = useCalendarSourceLookup();

  return useMutation({
    mutationFn: async ({ event, startAt, endAt }: MoveEventPayload) => {
      const calendar = calendarFor(event.calendarId);

      if (calendar && calendar.sourceType !== 'internal') {
        // The provider owns its events: send the whole event with the new
        // times rather than a patch, per `docs/architecture.md` § Decision A.
        await writeProviderEvent({
          operation: 'update',
          eventId: event.id,
          draft: {
            title: event.title,
            description: event.description,
            location: event.location,
            startAt,
            endAt,
            allDay: event.allDay,
            timezone: event.timezone,
            recurrenceRule: event.recurrenceRule,
            alerts: event.alerts,
          },
        });
        return;
      }

      await updateEvent({ id: event.id, startAt, endAt });
    },

    onMutate: async ({ event, startAt, endAt }) => {
      // An in-flight window fetch would otherwise land after this and put the
      // event back at its old time.
      await queryClient.cancelQueries({ queryKey: queryKeys.events.all() });

      const windows = queryClient.getQueriesData<CalendarEvent[]>({
        queryKey: queryKeys.events.windows(),
      });
      const detail = queryClient.getQueryData<CalendarEvent>(queryKeys.events.detail(event.id));

      const moved = { ...event, startAt, endAt };
      queryClient.setQueriesData<CalendarEvent[]>(
        { queryKey: queryKeys.events.windows() },
        (rows) => rows?.map((row) => (row.id === event.id ? { ...row, startAt, endAt } : row)),
      );
      if (detail) queryClient.setQueryData(queryKeys.events.detail(event.id), moved);

      return { windows, detail, eventId: event.id };
    },

    onError: (_error, _payload, context) => {
      // Put every window back exactly as it was, so a failed move does not
      // leave the calendar showing a time the server never accepted.
      for (const [key, rows] of context?.windows ?? []) queryClient.setQueryData(key, rows);
      if (context?.detail) {
        queryClient.setQueryData(queryKeys.events.detail(context.eventId), context.detail);
      }
    },

    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onSettled: () => void invalidate(),
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateEvents();
  const calendarFor = useCalendarSourceLookup();

  return useMutation({
    mutationFn: async ({ id, calendarId }: { id: string; calendarId: string }) => {
      const calendar = calendarFor(calendarId);

      if (calendar && calendar.sourceType !== 'internal') {
        await writeProviderEvent({ operation: 'delete', eventId: id });
        return;
      }

      await deleteEvent(id);
    },
    onSuccess: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
    onSettled: () => void invalidate(),
  });
}
