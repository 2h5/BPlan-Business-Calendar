import type { Profile, ProviderKind, UpdateProfileInput } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import {
  disconnectConnection,
  fetchConnections,
  fetchProviderCalendars,
  fetchProfile,
  fetchSyncHealth,
  setCalendarImported,
  startProviderConnect,
  syncConnection,
  updateProfile,
} from '../api/settings.api';

export function useProfile() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.profile(),
    queryFn: fetchProfile,
    enabled: isAuthenticated,
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => {
      if (!userId) throw new Error('Expected an authenticated user');
      return updateProfile(userId, input);
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: queryKeys.profile() });
      const previous = client.getQueryData<Profile>(queryKeys.profile());
      if (previous) client.setQueryData(queryKeys.profile(), { ...previous, ...input });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.profile(), context.previous);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.profile() }),
  });
}

export function useConnections() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.integrations.accounts(),
    queryFn: fetchConnections,
    enabled: isAuthenticated,
  });
}

export function useSyncHealth(options: { poll?: boolean } = {}) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.integrations.health(),
    queryFn: fetchSyncHealth,
    enabled: isAuthenticated,
    refetchInterval: options.poll ? 10_000 : false,
  });
}

export function useProviderCalendars(providerAccountId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.integrations.calendars(providerAccountId ?? 'none'),
    queryFn: () => fetchProviderCalendars(providerAccountId as string),
    enabled: enabled && Boolean(providerAccountId),
    staleTime: 60_000,
  });
}

export function useConnectProvider() {
  return useMutation<void, unknown, ProviderKind>({
    mutationFn: async (provider) => {
      const authorizationUrl = await startProviderConnect(provider);
      // OAuth belongs in the same browser tab so the callback can restore the
      // normal Supabase session without popup/opener state.
      window.location.assign(authorizationUrl);
    },
  });
}

export function useToggleCalendarImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: setCalendarImported,
    onSuccess: (_result, variables) => {
      void client.invalidateQueries({
        queryKey: queryKeys.integrations.calendars(variables.providerAccountId),
      });
      void client.invalidateQueries({ queryKey: queryKeys.integrations.health() });
      void client.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      void client.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useSyncConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: syncConnection,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.integrations.all() });
      void client.invalidateQueries({ queryKey: queryKeys.integrations.health() });
      void client.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}

export function useDisconnectConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: disconnectConnection,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.integrations.all() });
      void client.invalidateQueries({ queryKey: queryKeys.integrations.health() });
      void client.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      void client.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}
