// @vitest-environment jsdom
import '../../../test/dom';

import type { Session } from '@supabase/supabase-js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionState } from './useSession';

type AuthListener = (event: string, session: Session | null) => void;

const auth = vi.hoisted(() => ({
  initial: null as Session | null,
  listener: null as AuthListener | null,
}));

vi.mock('../../../lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: auth.initial } }),
      onAuthStateChange: (listener: AuthListener) => {
        auth.listener = listener;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));

const discardFindTimeSession = vi.hoisted(() => vi.fn());
vi.mock('../../scheduling', () => ({ discardFindTimeSession }));

const sessionFor = (id: string) => ({ user: { id } }) as unknown as Session;

function setup() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['profile'], { displayName: 'Previous account' });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSessionState(), { wrapper });
  return { queryClient, hook };
}

describe('useSessionState', () => {
  beforeEach(() => {
    auth.initial = sessionFor('user-a');
    auth.listener = null;
    discardFindTimeSession.mockClear();
  });

  it('keeps the cache when the stored session restores', async () => {
    const { queryClient, hook } = setup();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    act(() => auth.listener?.('TOKEN_REFRESHED', sessionFor('user-a')));

    expect(queryClient.getQueryData(['profile'])).toEqual({ displayName: 'Previous account' });
    expect(discardFindTimeSession).not.toHaveBeenCalled();
  });

  it('drops the previous user’s data on sign-out', async () => {
    const { queryClient, hook } = setup();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    act(() => auth.listener?.('SIGNED_OUT', null));

    expect(queryClient.getQueryData(['profile'])).toBeUndefined();
    expect(discardFindTimeSession).toHaveBeenCalledTimes(1);
    expect(hook.result.current.session).toBeNull();
  });

  it('drops the previous user’s data when another account signs in', async () => {
    const { queryClient, hook } = setup();
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false));

    act(() => auth.listener?.('SIGNED_IN', sessionFor('user-b')));

    expect(queryClient.getQueryData(['profile'])).toBeUndefined();
    expect(hook.result.current.session?.user.id).toBe('user-b');
  });
});
