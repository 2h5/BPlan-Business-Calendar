import { type Profile, type ProviderAccount, type UpdateProfileInput } from '@cal/schemas';

import { profileUpdatePayload, providerAccountRowSchema } from './settings-mappers';
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

async function invoke(name: string, body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke(name, { body });
  if (error) throw toAppError(error);
}

export async function syncConnection(providerAccountId: string): Promise<void> {
  await invoke('sync-run', { providerAccountId });
}

export async function disconnectConnection(providerAccountId: string): Promise<void> {
  await invoke('integrations-disconnect', { providerAccountId });
}
