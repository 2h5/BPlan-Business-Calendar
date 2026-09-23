import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

/**
 * Pull-to-refresh for a screen: refetch the queries it shows and hold the
 * spinner until they land.
 *
 * `refreshing` is local rather than read from the queries so that only the
 * user's own pull spins the control — a background refetch (a mutation's
 * invalidation, a reconnect) should stay invisible.
 *
 * Pass a module-level constant for `keys` so the callback stays stable.
 */
export function usePullToRefresh(keys: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all(
      keys.map((queryKey) => queryClient.refetchQueries({ queryKey, type: 'active' })),
    ).finally(() => setRefreshing(false));
  }, [queryClient, keys]);

  return { refreshing, onRefresh };
}
