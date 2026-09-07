import { calendarSchema, eventSchema, profileSchema } from '@cal/schemas';
import { z } from 'zod';

export const eventRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    calendar_id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    start_at: z.string(),
    end_at: z.string(),
    all_day: z.boolean(),
    timezone: z.string(),
    status: z.string(),
    recurrence_rule: z.string().nullable(),
    alerts: z.array(z.number()).nullable(),
    source_type: z.string(),
    provider_event_id: z.string().nullable(),
    provider_etag: z.string().nullable(),
    recurring_event_id: z.string().nullable(),
    recurrence_original_start_at: z.string().nullable(),
    provider_updated_at: z.string().nullable(),
    sync_status: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description,
    location: row.location,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    timezone: row.timezone,
    status: row.status,
    recurrenceRule: row.recurrence_rule,
    alerts: row.alerts ?? [],
    sourceType: row.source_type,
    providerEventId: row.provider_event_id,
    providerEtag: row.provider_etag,
    recurringEventId: row.recurring_event_id,
    recurrenceOriginalStartAt: row.recurrence_original_start_at,
    providerUpdatedAt: row.provider_updated_at,
    syncStatus: row.sync_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(eventSchema);

export const calendarRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    name: z.string(),
    color: z.string(),
    source_type: z.string(),
    provider_account_id: z.string().nullable(),
    provider_calendar_id: z.string().nullable(),
    is_visible: z.boolean(),
    is_default: z.boolean(),
    is_read_only: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    sourceType: row.source_type,
    providerAccountId: row.provider_account_id,
    providerCalendarId: row.provider_calendar_id,
    isVisible: row.is_visible,
    isDefault: row.is_default,
    isReadOnly: row.is_read_only,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(calendarSchema);

export const profileRowSchema = z
  .object({
    id: z.string(),
    full_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    timezone: z.string(),
    week_starts_on: z.number(),
    hour_cycle: z.string(),
    default_task_minutes: z.number(),
    default_event_minutes: z.number(),
    working_hours: z.unknown(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    timezone: row.timezone,
    weekStartsOn: row.week_starts_on,
    hourCycle: row.hour_cycle,
    defaultTaskMinutes: row.default_task_minutes,
    defaultEventMinutes: row.default_event_minutes,
    workingHours: row.working_hours,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
  .pipe(profileSchema);
