import type { Profile, UpdateProfileInput } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import {
  disconnectConnection,
  fetchConnections,
  fetchProfile,
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
    queryKey: queryKeys.integrations.all(),
    queryFn: fetchConnections,
    enabled: isAuthenticated,
  });
}

export function useSyncConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: syncConnection,
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.integrations.all() }),
  });
}

export function useDisconnectConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: disconnectConnection,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.integrations.all() });
      void client.invalidateQueries({ queryKey: queryKeys.calendars.all() });
      void client.invalidateQueries({ queryKey: queryKeys.events.all() });
    },
  });
}
