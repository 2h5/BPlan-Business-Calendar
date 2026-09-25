import { DEFAULT_APP_PREFERENCES, type AppPreferences } from '@cal/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import { fetchAppPreferences, updateAppPreferences } from '../api/settings.api';
import { readCachedAppPreferences, writeCachedAppPreferences } from '../utils/app-preferences';

export interface AppPreferencesContextValue {
  preferences: AppPreferences;
  setPreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => void;
  resetPreferences: () => void;
}

const PREFERENCES_MUTATION_KEY = ['preferences', 'update'] as const;

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

/**
 * Account-wide behavior preferences. `profiles.preferences` is the source of
 * truth, so a choice follows the user to every browser; a per-user local cache
 * covers the moment before it loads so the UI does not flash default behavior.
 */
export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { userId } = useAuth();
  const queryKey = queryKeys.preferences(userId ?? 'signed-out');

  const query = useQuery({
    queryKey,
    queryFn: fetchAppPreferences,
    enabled: Boolean(userId),
    placeholderData: () => (userId ? readCachedAppPreferences(userId) : undefined),
  });

  useEffect(() => {
    if (userId && query.data && !query.isPlaceholderData) {
      writeCachedAppPreferences(userId, query.data);
    }
  }, [userId, query.data, query.isPlaceholderData]);

  const preferences = userId ? (query.data ?? DEFAULT_APP_PREFERENCES) : DEFAULT_APP_PREFERENCES;
  // Changes build on the newest value (including optimistic ones) so quick
  // successive edits compose instead of overwriting each other.
  const latestRef = useRef(preferences);
  latestRef.current = client.getQueryData<AppPreferences>(queryKey) ?? preferences;

  const { mutate } = useMutation({
    mutationKey: PREFERENCES_MUTATION_KEY,
    mutationFn: (next: AppPreferences) => {
      if (!userId) throw new Error('Expected an authenticated user');
      return updateAppPreferences(userId, next);
    },
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<AppPreferences>(queryKey);
      client.setQueryData(queryKey, next);
      latestRef.current = next;
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      // Refetching while a later change is still in flight would briefly undo it.
      if (client.isMutating({ mutationKey: PREFERENCES_MUTATION_KEY }) === 1) {
        void client.invalidateQueries({ queryKey });
      }
    },
  });

  const setPreference = useCallback(
    <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
      mutate({ ...latestRef.current, [key]: value });
    },
    [mutate],
  );

  const resetPreferences = useCallback(() => mutate(DEFAULT_APP_PREFERENCES), [mutate]);

  const value = useMemo<AppPreferencesContextValue>(
    () => ({ preferences, setPreference, resetPreferences }),
    [preferences, setPreference, resetPreferences],
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences(): AppPreferencesContextValue {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error('useAppPreferences must be used within an <AppPreferencesProvider>');
  }
  return context;
}
