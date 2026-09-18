import { dateKeyMinuteToInstant, shiftOccurrenceByDays } from '@cal/domain';
import { useCallback } from 'react';

import { useMoveEvent } from '../../events/hooks/useEvents';
import type { EventMove } from '../components/DraggableEventChip';
import type { EventDayMove } from '../components/month-view/DraggableEventBar';

/**
 * Turns a finished drag into a write.
 *
 * The views hand over a day and two minutes of that day — the language the
 * grid is drawn in — and the instants are resolved here, once, so day and week
 * cannot disagree about what "Friday at 11" means.
 */
export function useMoveOccurrence(timeZone: string): (move: EventMove) => Promise<void> {
  const moveEvent = useMoveEvent();

  return useCallback(
    async ({ occurrence, dateKey, startMinute, endMinute }: EventMove) => {
      const startAt = dateKeyMinuteToInstant(dateKey, startMinute, timeZone);
      const endAt = dateKeyMinuteToInstant(dateKey, endMinute, timeZone);

      // The hour a spring-forward DST change skips has no instant to write.
      // Drop the move rather than silently storing some other time.
      if (!startAt || !endAt) return;

      try {
        await moveEvent.mutateAsync({
          event: occurrence.event,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      } catch {
        // Rolled back and logged by the mutation; the caller only needs to know
        // the move has settled so the chip can stop holding its dropped place.
      }
    },
    [moveEvent, timeZone],
  );
}

/**
 * The month grid's version: a drag there changes the date and nothing else.
 *
 * Both ends shift by the same number of local days, so the event keeps its
 * time of day — including across a DST change, which is why this goes through
 * `shiftOccurrenceByDays` rather than adding a fixed number of milliseconds.
 */
export function useMoveOccurrenceByDays(timeZone: string): (move: EventDayMove) => Promise<void> {
  const moveEvent = useMoveEvent();

  return useCallback(
    async ({ occurrence, dayDelta }: EventDayMove) => {
      if (dayDelta === 0) return;
      const { startAt, endAt } = shiftOccurrenceByDays(occurrence, dayDelta, timeZone);

      try {
        await moveEvent.mutateAsync({
          event: occurrence.event,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
        });
      } catch {
        // Rolled back and logged by the mutation; the caller only needs to know
        // the move has settled so the bar can stop holding its dropped place.
      }
    },
    [moveEvent, timeZone],
  );
}
