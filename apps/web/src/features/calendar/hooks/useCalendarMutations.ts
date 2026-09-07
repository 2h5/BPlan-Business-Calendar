import type {
  Calendar,
  CalendarEvent,
  CreateCalendarInput,
  CreateEventInput,
  UpdateCalendarInput,
} from '@cal/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useRequiredUserId } from '../../auth';
import {
  createCalendar,
  createEvent,
  deleteCalendar,
  deleteEvent,
  updateCalendar,
  updateCalendarVisibility,
  updateEvent,
  writeProviderEvent,
  type ProviderEventDraft,
} from '../api/calendar.api';
import { assertSupportedCalendarMove, eventWriteRoute } from '../utils/event-ownership';

function providerDraft(input: CreateEventInput): ProviderEventDraft {
  return {
    title: input.title,
    description: input.description,
    location: input.location,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay,
    timezone: input.timezone,
    recurrenceRule: input.recurrenceRule,
    alerts: input.alerts,
  };
}

function writable(calendar: Calendar | undefined): Calendar {
  if (!calendar) throw new Error('That calendar is no longer available.');
  if (eventWriteRoute(calendar) === 'read-only') throw new Error(`${calendar.name} is read only.`);
  return calendar;
}

function useInvalidateCalendar() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
  };
}

export function useCreateCalendar() {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (input: CreateCalendarInput) => createCalendar(input, userId),
    onSettled: invalidate,
  });
}

export function useUpdateCalendar() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: ({ calendar, input }: { calendar: Calendar; input: UpdateCalendarInput }) => {
      if (calendar.sourceType !== 'internal') {
        throw new Error('Synced calendar names and colors are managed by the provider.');
      }
      return updateCalendar(calendar.id, input);
    },
    onSettled: invalidate,
  });
}

export function useToggleCalendarVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isVisible }: { id: string; isVisible: boolean }) =>
      updateCalendarVisibility(id, isVisible),
    onMutate: async ({ id, isVisible }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.calendars.all() });
      const previous = queryClient.getQueryData<Calendar[]>(queryKeys.calendars.all());
      queryClient.setQueryData<Calendar[]>(queryKeys.calendars.all(), (current) =>
        current?.map((calendar) => (calendar.id === id ? { ...calendar, isVisible } : calendar)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(queryKeys.calendars.all(), context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useDeleteCalendar() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: (calendar: Calendar) => {
      if (calendar.sourceType !== 'internal') {
        throw new Error('Synced calendars are removed by disconnecting their provider.');
      }
      if (calendar.isDefault) throw new Error('The default calendar cannot be deleted.');
      return deleteCalendar(calendar.id);
    },
    onSettled: invalidate,
  });
}

export function useCreateEvent(calendars: readonly Calendar[]) {
  const userId = useRequiredUserId();
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: async (input: CreateEventInput) => {
      const calendar = writable(calendars.find((item) => item.id === input.calendarId));
      if (eventWriteRoute(calendar) === 'internal') return createEvent(input, userId);
      await writeProviderEvent({
        operation: 'create',
        calendarId: calendar.id,
        draft: providerDraft(input),
      });
    },
    onSettled: invalidate,
  });
}

export function useUpdateEvent(calendars: readonly Calendar[]) {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: async ({ event, input }: { event: CalendarEvent; input: CreateEventInput }) => {
      const currentCalendar = writable(
        calendars.find((calendar) => calendar.id === event.calendarId),
      );
      const targetCalendar = writable(
        calendars.find((calendar) => calendar.id === input.calendarId),
      );

      assertSupportedCalendarMove(currentCalendar, targetCalendar);
      if (eventWriteRoute(currentCalendar) === 'provider') {
        await writeProviderEvent({
          operation: 'update',
          eventId: event.id,
          draft: providerDraft(input),
        });
        return;
      }
      return updateEvent({ id: event.id, ...input });
    },
    onSettled: invalidate,
  });
}

export function useDeleteEvent(calendars: readonly Calendar[]) {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: async (event: CalendarEvent) => {
      const calendar = writable(calendars.find((item) => item.id === event.calendarId));
      if (eventWriteRoute(calendar) === 'internal') return deleteEvent(event.id);
      await writeProviderEvent({ operation: 'delete', eventId: event.id });
    },
    onSettled: invalidate,
  });
}
