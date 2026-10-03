import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { logError } from '../../../lib/logger';
import { useAuth } from '../../auth';
import { useToggleTaskComplete } from '../../tasks/hooks/useTasks';
import { acknowledgePendingTaskToggles, readPendingTaskToggles } from '../api/widget-storage';
import type { PendingTaskToggle } from '../schema';

/**
 * Sends task ticks made on the Home Screen.
 *
 * The widget runs outside the app and has no session, so its checkbox only
 * records the tick in shared storage and shows it at once. The app sends each
 * one through the same mutation as an in-app tick — repeating tasks advance
 * rather than complete — when it next comes to the foreground.
 */
export function usePendingWidgetToggles(): void {
  const { isAuthenticated } = useAuth();
  const { mutateAsync } = useToggleTaskComplete();
  const running = useRef(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const drain = async () => {
      if (running.current) return;
      running.current = true;

      try {
        // Only the latest tick per task counts: ticking and un-ticking on the
        // Home Screen must not send two requests that race each other.
        const pending = readPendingTaskToggles();
        const latest = new Map<string, PendingTaskToggle>();
        for (const toggle of pending) latest.set(toggle.id, toggle);

        for (const toggle of latest.values()) {
          try {
            await mutateAsync({ id: toggle.id, completed: toggle.completed });
          } catch (error) {
            // A task deleted elsewhere cannot be ticked; drop it rather than
            // retrying forever. The widget's next snapshot will not show it.
            logError(error);
          }
        }

        acknowledgePendingTaskToggles(pending);
      } finally {
        running.current = false;
      }
    };

    void drain().catch(logError);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drain().catch(logError);
    });
    return () => subscription.remove();
  }, [isAuthenticated, mutateAsync]);
}
