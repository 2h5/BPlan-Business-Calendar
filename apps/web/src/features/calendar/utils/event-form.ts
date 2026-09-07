import {
  addZonedDays,
  getZonedParts,
  parseRRule,
  toZonedDateKey,
  zonedWallClockToUtc,
} from '@cal/domain';
import { createEventSchema, type CalendarEvent, type CreateEventInput } from '@cal/schemas';

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  calendarId: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  recurrenceRule: string | null;
}

const pad = (value: number): string => String(value).padStart(2, '0');

function wallClockFields(instant: Date, timeZone: string): { date: string; time: string } {
  const parts = getZonedParts(instant, timeZone);
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  };
}

function parseDateAndTime(
  date: string,
  time: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error('Choose a valid date and time.');
  }
  return {
    year: year as number,
    month: month as number,
    day: day as number,
    hour: hour as number,
    minute: minute as number,
  };
}

export function eventToFormValues(event: CalendarEvent, timeZone: string): EventFormValues {
  const start = wallClockFields(new Date(event.startAt), timeZone);
  const endInstant = event.allDay
    ? addZonedDays(new Date(event.endAt), -1, timeZone)
    : new Date(event.endAt);
  const end = wallClockFields(endInstant, timeZone);
  return {
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    calendarId: event.calendarId,
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    allDay: event.allDay,
    recurrenceRule: event.recurrenceRule,
  };
}

export function newEventFormValues(
  dateKey: string,
  calendarId: string,
  timeZone: string,
  durationMinutes: number,
): EventFormValues {
  const now = new Date();
  const nowKey = toZonedDateKey(now, timeZone);
  const nowParts = getZonedParts(now, timeZone);
  const startHour = dateKey === nowKey ? Math.min(23, nowParts.hour + 1) : 9;
  const start = zonedWallClockToUtc(parseDateAndTime(dateKey, `${pad(startHour)}:00`), timeZone);
  const end = wallClockFields(new Date(start.getTime() + durationMinutes * 60_000), timeZone);
  return {
    title: '',
    description: '',
    location: '',
    calendarId,
    startDate: dateKey,
    startTime: `${pad(startHour)}:00`,
    endDate: end.date,
    endTime: end.time,
    allDay: false,
    recurrenceRule: null,
  };
}

export function eventInputFromForm(values: EventFormValues, timeZone: string): CreateEventInput {
  if (values.recurrenceRule && !parseRRule(values.recurrenceRule)) {
    throw new Error('Choose a supported repeat pattern.');
  }

  const start = zonedWallClockToUtc(
    parseDateAndTime(values.startDate, values.allDay ? '00:00' : values.startTime),
    timeZone,
  );
  let end = zonedWallClockToUtc(
    parseDateAndTime(values.endDate, values.allDay ? '00:00' : values.endTime),
    timeZone,
  );
  if (values.allDay) end = addZonedDays(end, 1, timeZone);

  if (end.getTime() <= start.getTime()) {
    throw new Error('The event must end after it starts.');
  }

  return createEventSchema.parse({
    calendarId: values.calendarId,
    title: values.title,
    description: values.description.trim() || null,
    location: values.location.trim() || null,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    allDay: values.allDay,
    timezone: timeZone,
    recurrenceRule: values.recurrenceRule,
    alerts: [],
  });
}
