import { useCallback, useEffect, useState } from 'react';

import type { EventOccurrence } from './useCalendarWindow';
import type { EventTiming } from '../types';

type AuthoritativeTimingOccurrence = Pick<EventOccurrence, 'start' | 'end'> & {
  event: Pick<EventOccurrence['event'], 'id'>;
};

export function reflectedTimingOverrideIds(
  timingOverrides: ReadonlyMap<string, EventTiming>,
  occurrences: readonly AuthoritativeTimingOccurrence[],
): string[] {
  return [...timingOverrides]
    .filter(([eventId, timing]) => {
      const authoritative = occurrences.find((occurrence) => occurrence.event.id === eventId);
      return authoritative?.start === timing.start && authoritative.end === timing.end;
    })
    .map(([eventId]) => eventId);
}

export function useCalendarTimingOverrides(occurrences: readonly EventOccurrence[]) {
  const [timingOverrides, setTimingOverrides] = useState<ReadonlyMap<string, EventTiming>>(
    () => new Map(),
  );

  useEffect(() => {
    const reflectedEventIds = reflectedTimingOverrideIds(timingOverrides, occurrences);
    if (reflectedEventIds.length === 0) return;

    setTimingOverrides((current) => {
      const next = new Map(current);
      reflectedEventIds.forEach((eventId) => next.delete(eventId));
      return next;
    });
  }, [occurrences, timingOverrides]);

  const setTimingOverride = useCallback((eventId: string, timing: EventTiming | null) => {
    setTimingOverrides((current) => {
      const next = new Map(current);
      if (timing) next.set(eventId, timing);
      else next.delete(eventId);
      return next;
    });
  }, []);

  return { timingOverrides, setTimingOverride };
}
