import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabase/client';
import { discardFindTimeSession } from '../../scheduling';

export interface SessionState {
  session: Session | null;
  /** True while the session is initially restoring from browser storage */
  isLoading: boolean;
}

/**
 * Single source of truth for browser authentication session state.
 * Subscribes to Supabase auth state changes and restores persisted sessions.
 *
 * Whenever the signed-in user changes (sign-out, or a different account
 * signing in, including from another tab), everything cached for the previous
 * user is dropped before the new session is published. Most query keys are
 * not user-scoped, so without this the next account would briefly see the
 * last one's profile, events, and tasks.
 */
export function useSessionState(): SessionState {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** `undefined` until the first session is known, so the restore never clears. */
  const userIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    const publish = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (userIdRef.current !== undefined && userIdRef.current !== nextUserId) {
        queryClient.clear();
        discardFindTimeSession();
      }
      userIdRef.current = nextUserId;
      setSession(nextSession);
      setIsLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      publish(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      publish(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return { session, isLoading };
}
