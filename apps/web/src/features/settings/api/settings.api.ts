import {
  type CalendarSyncHealth,
  type ExternalCalendar,
  type Profile,
  type ProviderAccount,
  type ProviderKind,
  type UpdateProfileInput,
  providerKindSchema,
  uuidSchema,
} from '@cal/schemas';
import { z } from 'zod';

import {
  calendarImportRequestSchema,
  calendarImportResultSchema,
  calendarSyncHealthRowSchema,
  profileUpdatePayload,
  providerAccountRowSchema,
  providerCalendarsResponseSchema,
} from './settings-mappers';
import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';
import { profileRowSchema } from '../../calendar/api/calendar-mappers';

export async function fetchProfile(): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').single();
  if (error) throw toAppError(error);
  return profileRowSchema.parse(data);
}

export async function updateProfile(id: string, input: UpdateProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update(profileUpdatePayload(input))
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toAppError(error);
  return profileRowSchema.parse(data);
}

export async function fetchConnections(): Promise<ProviderAccount[]> {
  const { data, error } = await supabase
    .from('provider_accounts_public')
    .select('*')
    .order('connected_at');
  if (error) throw toAppError(error);
  return (data ?? []).map((row) => providerAccountRowSchema.parse(row));
}

const OAUTH_START_FUNCTIONS: Record<ProviderKind, string> = {
  google: 'oauth-google-start',
  microsoft: 'oauth-microsoft-start',
};

export async function startProviderConnect(provider: ProviderKind): Promise<string> {
  const parsedProvider = providerKindSchema.parse(provider);
  const data = await invoke<unknown>(OAUTH_START_FUNCTIONS[parsedProvider], {
    returnTarget: 'web',
  });
  return z.object({ authorizationUrl: z.string().url() }).parse(data).authorizationUrl;
}

export async function fetchSyncHealth(): Promise<CalendarSyncHealth[]> {
  const { data, error } = await supabase.from('calendar_sync_health').select('*');
  if (error) throw toAppError(error);
  return (data ?? []).map((row) => calendarSyncHealthRowSchema.parse(row));
}

export async function fetchProviderCalendars(
  providerAccountId: string,
): Promise<ExternalCalendar[]> {
  const data = await invoke<unknown>('integrations-calendars', {
    providerAccountId: uuidSchema.parse(providerAccountId),
  });
  return providerCalendarsResponseSchema.parse(data).calendars;
}

export async function setCalendarImported(input: {
  providerAccountId: string;
  providerCalendarId: string;
  imported: boolean;
}): Promise<{ calendarId: string | null; syncing: boolean }> {
  const parsedInput = calendarImportRequestSchema.parse(input);
  const data = await invoke<unknown>('integrations-import', parsedInput);
  return calendarImportResultSchema.parse(data);
}

export async function syncConnection(providerAccountId: string): Promise<void> {
  await invoke<unknown>('sync-run', { providerAccountId: uuidSchema.parse(providerAccountId) });
}

export async function disconnectConnection(providerAccountId: string): Promise<void> {
  await invoke<unknown>('integrations-disconnect', {
    providerAccountId: uuidSchema.parse(providerAccountId),
  });
}

/**
 * Preserve stable Edge Function error codes instead of exposing the generic
 * FunctionsHttpError status line to the Settings UI.
 */
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T | { error?: unknown }>(name, { body });

  if (error) {
    const envelope = await readErrorEnvelope(error);
    throw toAppError(envelope ?? error);
  }

  const failure = errorEnvelopeSchema.safeParse(data);
  if (failure.success) throw toAppError(failure.data.error);

  return data as T;
}

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

async function readErrorEnvelope(
  error: unknown,
): Promise<{ code: string; message: string } | null> {
  const response = (error as { context?: Response }).context;
  if (!(response instanceof Response)) return null;

  try {
    const parsed = errorEnvelopeSchema.safeParse(await response.clone().json());
    return parsed.success ? parsed.data.error : null;
  } catch {
    return null;
  }
}
