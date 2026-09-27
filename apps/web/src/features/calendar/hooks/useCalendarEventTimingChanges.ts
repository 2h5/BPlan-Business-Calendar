import { useCallback } from 'react';

import type { useUpdateEvent } from './useCalendarMutations';
import type { useCalendarToast } from './useCalendarToast';
import type { EventOccurrence } from './useCalendarWindow';
import type { EventTiming } from '../timeline/TimelineView';
import { eventInputWithTiming } from '../utils/event-form';

interface CalendarEventTimingChangeOptions {
  timingOverrides: ReadonlyMap<string, EventTiming>;
  setTimingOverride: (eventId: string, timing: EventTiming | null) => void;
  updateEvent: Pick<ReturnType<typeof useUpdateEvent>, 'mutateAsync'>;
  showToast: ReturnType<typeof useCalendarToast>['showToast'];
  showSuccess: ReturnType<typeof useCalendarToast>['showSuccess'];
  refetch: () => void;
}

type TimingChangeKind = 'move' | 'resize';

export function useCalendarEventTimingChanges({
  timingOverrides,
  setTimingOverride,
  updateEvent,
  showToast,
  showSuccess,
  refetch,
}: CalendarEventTimingChangeOptions) {
  const handleTimingChange = useCallback(
    (kind: TimingChangeKind, occurrence: EventOccurrence, timing: EventTiming) => {
      const { event } = occurrence;
      const previous = timingOverrides.get(event.id) ?? {
        start: occurrence.start,
        end: occurrence.end,
      };
      if (previous.start === timing.start && previous.end === timing.end) return;

      setTimingOverride(event.id, timing);
      const persist = async () => {
        try {
          await updateEvent.mutateAsync({
            event,
            input: eventInputWithTiming(
              event,
              new Date(timing.start).toISOString(),
              new Date(timing.end).toISOString(),
            ),
          });
          showToast({
            message: kind === 'move' ? 'Event moved' : 'Event resized',
            actionLabel: 'Undo',
            onAction: () => {
              setTimingOverride(event.id, previous);
              showToast({ message: 'Restoring event…' });
              void updateEvent
                .mutateAsync({
                  event,
                  input: eventInputWithTiming(
                    event,
                    new Date(previous.start).toISOString(),
                    new Date(previous.end).toISOString(),
                  ),
                })
                .then(() => showSuccess(kind === 'move' ? 'Move undone.' : 'Resize undone.'))
                .catch(() => {
                  setTimingOverride(event.id, null);
                  refetch();
                  showToast({
                    message:
                      kind === 'move'
                        ? 'The move could not be undone.'
                        : 'The resize could not be undone.',
                  });
                });
            },
          });
        } catch {
          setTimingOverride(event.id, null);
          showToast({
            message:
              kind === 'move'
                ? 'The event move could not be saved.'
                : 'The event resize could not be saved.',
          });
        }
      };
      void persist();
    },
    [refetch, showSuccess, showToast, setTimingOverride, timingOverrides, updateEvent],
  );

  const handleMoveEvent = useCallback(
    (occurrence: EventOccurrence, timing: EventTiming) =>
      handleTimingChange('move', occurrence, timing),
    [handleTimingChange],
  );
  const handleResizeEvent = useCallback(
    (occurrence: EventOccurrence, timing: EventTiming) =>
      handleTimingChange('resize', occurrence, timing),
    [handleTimingChange],
  );

  return { handleMoveEvent, handleResizeEvent };
}
