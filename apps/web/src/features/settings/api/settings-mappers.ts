import { type UpdateProfileInput, providerAccountSchema, updateProfileSchema } from '@cal/schemas';
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
