import {
  type UpdateProfileInput,
  calendarSyncHealthSchema,
  externalCalendarSchema,
  providerAccountSchema,
  updateProfileSchema,
  uuidSchema,
} from '@cal/schemas';
import type { TablesUpdate } from '@cal/types';
import { z } from 'zod';

export const providerAccountRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    provider: z.string(),
    email: z.string().nullable(),
    status: z.string(),
    scopes: z.array(z.string()).nullable(),
    connected_at: z.string(),
    last_sync_at: z.string().nullable(),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    email: row.email,
    status: row.status,
    scopes: row.scopes ?? [],
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
  }))
  .pipe(providerAccountSchema);

export const calendarSyncHealthRowSchema = z
  .object({
    calendar_id: z.string().uuid().nullable(),
    provider_account_id: z.string().uuid(),
    provider: z.string(),
    account_status: z.string(),
    last_full_sync_at: z.string().nullable(),
    last_incremental_sync_at: z.string().nullable(),
    webhook_expires_at: z.string().nullable(),
    needs_full_resync: z.boolean(),
    has_error: z.boolean(),
    retry_count: z.number().int().min(0),
  })
  .transform((row) => ({
    calendarId: row.calendar_id,
    providerAccountId: row.provider_account_id,
    provider: row.provider,
    accountStatus: row.account_status,
    lastFullSyncAt: row.last_full_sync_at,
    lastIncrementalSyncAt: row.last_incremental_sync_at,
    webhookExpiresAt: row.webhook_expires_at,
    needsFullResync: row.needs_full_resync,
    hasError: row.has_error,
    retryCount: row.retry_count,
  }))
  .pipe(calendarSyncHealthSchema);

export const providerCalendarsResponseSchema = z.object({
  calendars: z.array(externalCalendarSchema),
});

export const calendarImportRequestSchema = z.object({
  providerAccountId: uuidSchema,
  providerCalendarId: z.string().min(1),
  imported: z.boolean(),
});

export const calendarImportResultSchema = z.object({
  calendarId: uuidSchema.nullable(),
  syncing: z.boolean(),
});

export function profileUpdatePayload(input: UpdateProfileInput): TablesUpdate<'profiles'> {
  const patch = updateProfileSchema.parse(input);
  const payload: TablesUpdate<'profiles'> = {};
  if (patch.fullName !== undefined) payload.full_name = patch.fullName;
  if (patch.avatarUrl !== undefined) payload.avatar_url = patch.avatarUrl;
  if (patch.timezone !== undefined) payload.timezone = patch.timezone;
  if (patch.weekStartsOn !== undefined) payload.week_starts_on = patch.weekStartsOn;
  if (patch.hourCycle !== undefined) payload.hour_cycle = patch.hourCycle;
  if (patch.defaultTaskMinutes !== undefined)
    payload.default_task_minutes = patch.defaultTaskMinutes;
  if (patch.defaultEventMinutes !== undefined)
    payload.default_event_minutes = patch.defaultEventMinutes;
  if (patch.workingHours !== undefined) payload.working_hours = patch.workingHours;
  return payload;
}
