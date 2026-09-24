import { parseEventAlertKey } from '@cal/domain';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { logError } from '../../../lib/logger';
import { useEventEditorStore } from '../../../store/event-editor.store';
import { useSnoozeTask, useToggleTaskComplete } from '../../tasks/hooks/useTasks';

interface ResponsePayload {
  kind?: unknown;
  taskId?: unknown;
  eventId?: unknown;
  reminderKey?: unknown;
}

/**
 * Handles what happens when a reminder is tapped or one of its action buttons
 * is pressed. Kept separate from scheduling so the two can be reasoned about
 * independently.
 */
export function useNotificationResponse(): void {
  const toggleComplete = useToggleTaskComplete();
  const snooze = useSnoozeTask();
  const openEvent = useEventEditorStore((state) => state.openEvent);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const payload = response.notification.request.content.data as ResponsePayload | undefined;

        // Event alerts are recognised by their key as well as their kind:
        // alerts scheduled before the payload carried `kind: 'event'` were
        // labelled as tasks, with the event id in `taskId`.
        const eventAlert =
          typeof payload?.reminderKey === 'string' ? parseEventAlertKey(payload.reminderKey) : null;
        const eventId =
          eventAlert?.eventId ??
          (payload?.kind === 'event' && typeof payload.eventId === 'string'
            ? payload.eventId
            : null);

        if (eventId) {
          // An event has no quick actions; only a plain tap does anything.
          if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
            openEvent(eventId);
          }
          return;
        }

        if (payload?.kind !== 'task' || typeof payload.taskId !== 'string') return;
        const taskId = payload.taskId;

        switch (response.actionIdentifier) {
          case 'complete':
            toggleComplete.mutate({ id: taskId, completed: true });
            return;

          case 'snooze':
            snooze.mutate({
              id: taskId,
              dueAt: new Date(Date.now() + 60 * 60_000),
              hasDueTime: true,
            });
            return;

          default:
            // A plain tap opens the task in the inbox.
            router.push({ pathname: '/(tabs)/tasks', params: { taskId } });
        }
      } catch (error) {
        logError(error);
      }
    });

    return () => subscription.remove();
  }, [toggleComplete, snooze, openEvent]);
}
