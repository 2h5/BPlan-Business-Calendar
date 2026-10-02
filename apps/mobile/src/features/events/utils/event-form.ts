import {
  CALENDAR_COLORS,
  type CalendarColorOption,
  getZonedParts,
  toZonedDateKey,
  zonedWallClockToUtc,
} from '@cal/domain';
import type { CalendarEvent, CreateEventInput } from '@cal/schemas';

/** The event editor's working copy, before it is validated into a payload. */
export interface EventFormState {
  title: string;
  location: string;
  description: string;
  calendarId: string | null;
  /** NULL inherits the calendar's colour. */
  color: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  recurrenceRule: string | null;
  alerts: number[];
}

/** Minutes before the start that a new event alerts by default. */
export const DEFAULT_NEW_EVENT_ALERTS: readonly number[] = [10];

/**
 * Where a new event starts. An exact seed (a tapped calendar slot) wins. A
 * seeded day starts at the next half hour when it is today, or 09:00 on any
 * other day — never midnight, which is almost never what anyone means.
 */
export function defaultStart(
  seedStart: Date | null,
  seedDateKey: string | null,
  timeZone: string,
  now: Date = new Date(),
): Date {
  if (seedStart) return seedStart;

  const nextHalfHour = new Date(now);
  nextHalfHour.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  if (!seedDateKey || seedDateKey === toZonedDateKey(now, timeZone)) return nextHalfHour;

  const [year = 1970, month = 1, day = 1] = seedDateKey.split('-').map(Number);
  return zonedWallClockToUtc({ year, month, day, hour: 9, minute: 0 }, timeZone);
}

export interface NewEventFormOptions {
  seedStart: Date | null;
  seedDateKey: string | null;
  timeZone: string;
  calendarId: string | null;
  durationMinutes: number;
  now?: Date;
}

/** A blank form for a new event, seeded from where the user asked to create it. */
export function newEventForm({
  seedStart,
  seedDateKey,
  timeZone,
  calendarId,
  durationMinutes,
  now,
}: NewEventFormOptions): EventFormState {
  const start = defaultStart(seedStart, seedDateKey, timeZone, now);
  return {
    title: '',
    location: '',
    description: '',
    calendarId,
    color: null,
    start,
    end: new Date(start.getTime() + durationMinutes * 60_000),
    allDay: false,
    recurrenceRule: null,
    alerts: [...DEFAULT_NEW_EVENT_ALERTS],
  };
}

/** The form for an existing event. */
export function eventFormFrom(event: CalendarEvent): EventFormState {
  return {
    title: event.title,
    location: event.location ?? '',
    description: event.description ?? '',
    calendarId: event.calendarId,
    color: event.color,
    start: new Date(event.startAt),
    end: new Date(event.endAt),
    allDay: event.allDay,
    recurrenceRule: event.recurrenceRule,
    alerts: event.alerts,
  };
}

/** The calendar day of `day` at the wall-clock time of `time`, both read in `timeZone`. */
export function mergeDateAndTime(day: Date, time: Date, timeZone: string): Date {
  const dayParts = getZonedParts(day, timeZone);
  const timeParts = getZonedParts(time, timeZone);
  return zonedWallClockToUtc(
    {
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day,
      hour: timeParts.hour,
      minute: timeParts.minute,
    },
    timeZone,
  );
}

/** Moving the start drags the end with it, preserving the duration. */
export function withStart(
  form: Pick<EventFormState, 'start' | 'end'>,
  start: Date,
): { start: Date; end: Date } {
  const duration = form.end.getTime() - form.start.getTime();
  return { start, end: new Date(start.getTime() + Math.max(duration, 0)) };
}

/**
 * The colour palette, plus the event's own colour when it is no longer in
 * the palette — one set before the palette changed, or by another client.
 * Showing it as an extra swatch keeps the current colour visible and
 * selectable instead of silently absent.
 */
export function eventColorSwatches(color: string | null): readonly CalendarColorOption[] {
  return color && !CALENDAR_COLORS.some((option) => option.value === color)
    ? [...CALENDAR_COLORS, { label: 'Current', value: color }]
    : CALENDAR_COLORS;
}

export type EventPayloadResult =
  { ok: true; payload: CreateEventInput } | { ok: false; error: string };

/** Validates the form and shapes it into what the events API accepts. */
export function toEventPayload(form: EventFormState, timeZone: string): EventPayloadResult {
  const title = form.title.trim();
  if (!title) return { ok: false, error: 'Give the event a title' };
  if (!form.calendarId) return { ok: false, error: 'Pick a calendar first' };
  if (form.end.getTime() < form.start.getTime())
    return { ok: false, error: 'The event ends before it starts' };

  return {
    ok: true,
    payload: {
      calendarId: form.calendarId,
      title,
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      color: form.color,
      startAt: form.start.toISOString(),
      endAt: form.end.toISOString(),
      allDay: form.allDay,
      timezone: timeZone,
      recurrenceRule: form.recurrenceRule,
      alerts: form.alerts,
    },
  };
}
