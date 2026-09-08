import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import styles from './IntegrationsCallbackPage.module.css';
import {
  oauthCallbackMessage,
  parseOAuthCallback,
} from '../features/settings/utils/oauth-callback';
import { queryKeys } from '../lib/query/query-client';

export function IntegrationsCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const result = useMemo(() => parseOAuthCallback(location.search), [location.search]);

  useEffect(() => {
    let active = true;

    const finish = async () => {
      if (result.status === 'connected') {
        await Promise.allSettled([
          client.invalidateQueries({ queryKey: queryKeys.integrations.all() }),
          client.invalidateQueries({ queryKey: queryKeys.integrations.health() }),
          client.invalidateQueries({ queryKey: queryKeys.calendars.all() }),
          client.invalidateQueries({ queryKey: queryKeys.events.all() }),
        ]);
      }

      if (active) {
        // Replace the callback entry so refresh/back navigation cannot replay a
        // stale result or leave provider query parameters in the address bar.
        navigate('/settings', { replace: true, state: { integrationResult: result } });
      }
    };

    void finish();
    return () => {
      active = false;
    };
  }, [client, navigate, result]);

  return (
    <main className={styles.page} aria-live="polite">
      <section className={styles.card} aria-labelledby="callback-title">
        <h1 id="callback-title">Finishing calendar connection</h1>
        <p>{oauthCallbackMessage(result)}</p>
      </section>
    </main>
  );
}
