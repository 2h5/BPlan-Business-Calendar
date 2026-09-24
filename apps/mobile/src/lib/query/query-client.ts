import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { toAppError } from '../errors/app-error';
import { logError } from '../logger';

/**
 * React Native has no window focus event, so TanStack Query never learns that
 * the app came back to the foreground. Without this, an app left in the
 * background overnight keeps showing yesterday's rows until something else
 * invalidates them. `staleTime` still bounds how often a quick app switch
 * refetches.
 */
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => {
      handleFocus(state === 'active');
    });
    return () => subscription.remove();
  });
}

/**
 * Server state lives here, not in a global store. Defaults are tuned for a
 * calendar: data is fresh for a short while, returning to the app refetches
 * anything stale, and authorisation failures must not be retried in a loop.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const { code } = toAppError(error);
        if (code === 'NOT_AUTHENTICATED' || code === 'NOT_AUTHORIZED' || code === 'NOT_FOUND') {
          return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: 0,
      onError: (error) => logError(error),
    },
  },
});

/**
 * Every query key in the app, in one place.
 *
 * Centralising them is what makes invalidation after a mutation reliable — for
 * example, creating an event invalidates `events.window(...)` without each
 * call site having to remember the exact key shape.
 */
export const queryKeys = {
  profile: () => ['profile'] as const,

  calendars: {
    all: () => ['calendars'] as const,
  },

  events: {
    all: () => ['events'] as const,
    /** Prefix matching every cached window, for patching them all at once. */
    windows: () => ['events', 'window'] as const,
    window: (startIso: string, endIso: string) => ['events', 'window', startIso, endIso] as const,
    detail: (id: string) => ['events', 'detail', id] as const,
  },

  tasks: {
    all: () => ['tasks'] as const,
    list: (openOnly: boolean) => ['tasks', 'list', openOnly] as const,
    detail: (id: string) => ['tasks', 'detail', id] as const,
    lists: () => ['tasks', 'lists'] as const,
    tags: () => ['tasks', 'tags'] as const,
  },

  search: (query: string) => ['search', query] as const,

  integrations: {
    all: () => ['integrations'] as const,
    /** Calendars offered by one connected account — a provider read, not a table read. */
    calendars: (providerAccountId: string) =>
      ['integrations', 'calendars', providerAccountId] as const,
    health: () => ['integrations', 'health'] as const,
  },

  subscription: () => ['subscription'] as const,
} as const;
