import { addZonedDays, getZonedParts, minuteOfDay } from '@cal/domain';
import type { WorkingHours } from '@cal/schemas';

import { dateKeyToInstant } from './calendar-window';
import {
  dateMinuteToInstant,
  MINUTES_PER_DAY,
  MIN_RESIZE_DURATION_MINUTES,
  moveMinuteInterval,
  resizeMinuteInterval,
  type MinuteInterval,
  type ResizeEdge,
} from './event-resize';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

export const DEFAULT_MAGNETIC_THRESHOLD_MINUTES = 7;

export type MagneticTargetType =
  'event-start' | 'event-end' | 'working-hours-start' | 'working-hours-end';

export interface MagneticTarget {
  minute: number;
  type: MagneticTargetType;
  label?: string;
}

export interface MagneticSnapResult {
  edge: 'start' | 'end';
  target: MagneticTarget;
  snappedMinute: number;
}

export interface SnapMoveResult {
  interval: MinuteInterval;
  snap: MagneticSnapResult | null;
}

export interface SnapResizeResult {
  interval: MinuteInterval;
  snap: MagneticSnapResult | null;
}

export function collectMagneticTargets(params: {
  occurrences: EventOccurrence[];
  activeOccurrenceKey: string | null;
  dateKey: string;
  timeZone: string;
  workingHours?: WorkingHours;
}): MagneticTarget[] {
  const { occurrences, activeOccurrenceKey, dateKey, timeZone, workingHours } = params;
  const targetsMap = new Map<number, MagneticTarget>();

  const dayStartInstant = dateKeyToInstant(dateKey, timeZone);
  const dayStart = dayStartInstant.getTime();
  const dayEnd = addZonedDays(dayStartInstant, 1, timeZone).getTime();

  // 1. Working hours targets for this day's weekday
  const middayInstant = dateMinuteToInstant(dateKey, 12 * 60, timeZone);
  if (middayInstant && workingHours && workingHours.length > 0) {
    const parts = getZonedParts(middayInstant, timeZone);
    const dayWindows = workingHours.filter((w) => w.weekday === parts.weekday);
    for (const w of dayWindows) {
      if (w.startMinute > 0 && w.startMinute < MINUTES_PER_DAY) {
        targetsMap.set(w.startMinute, {
          minute: w.startMinute,
          type: 'working-hours-start',
          label: 'Working hours start',
        });
      }
      if (w.endMinute > 0 && w.endMinute < MINUTES_PER_DAY) {
        targetsMap.set(w.endMinute, {
          minute: w.endMinute,
          type: 'working-hours-end',
          label: 'Working hours end',
        });
      }
    }
  }

  // 2. Visible timed event boundaries (event boundaries take priority over working hours if matching the same minute)
  for (const occ of occurrences) {
    if (occ.event.allDay) continue;
    if (activeOccurrenceKey !== null && occ.key === activeOccurrenceKey) continue;

    const startMinute = occ.start <= dayStart ? 0 : minuteOfDay(new Date(occ.start), timeZone);
    const endMinute =
      occ.end >= dayEnd ? MINUTES_PER_DAY : minuteOfDay(new Date(occ.end), timeZone);

    if (startMinute > 0 && startMinute < MINUTES_PER_DAY) {
      targetsMap.set(startMinute, {
        minute: startMinute,
        type: 'event-start',
        label: occ.event.title,
      });
    }
    if (endMinute > 0 && endMinute < MINUTES_PER_DAY) {
      const existing = targetsMap.get(endMinute);
      if (!existing || existing.type.startsWith('working-hours')) {
        targetsMap.set(endMinute, {
          minute: endMinute,
          type: 'event-end',
          label: occ.event.title,
        });
      }
    }
  }

  return Array.from(targetsMap.values()).sort((a, b) => a.minute - b.minute);
}

export function snapMoveInterval(params: {
  originalMinutes: MinuteInterval;
  deltaMinutes: number;
  targets: MagneticTarget[];
  thresholdMinutes?: number;
}): SnapMoveResult {
  const threshold = params.thresholdMinutes ?? DEFAULT_MAGNETIC_THRESHOLD_MINUTES;
  const duration = params.originalMinutes.endMinute - params.originalMinutes.startMinute;
  const rawStart = params.originalMinutes.startMinute + params.deltaMinutes;
  const rawEnd = params.originalMinutes.endMinute + params.deltaMinutes;

  interface MoveCandidate {
    edge: 'start' | 'end';
    target: MagneticTarget;
    distance: number;
    interval: MinuteInterval;
  }

  const candidates: MoveCandidate[] = [];

  for (const target of params.targets) {
    // 1. Candidate where event start snaps to target.minute
    const startCandidateStart = target.minute;
    const startCandidateEnd = target.minute + duration;
    if (startCandidateStart >= 0 && startCandidateEnd <= MINUTES_PER_DAY) {
      const dist = Math.abs(rawStart - target.minute);
      if (dist <= threshold) {
        candidates.push({
          edge: 'start',
          target,
          distance: dist,
          interval: { startMinute: startCandidateStart, endMinute: startCandidateEnd },
        });
      }
    }

    // 2. Candidate where event end snaps to target.minute
    const endCandidateStart = target.minute - duration;
    const endCandidateEnd = target.minute;
    if (endCandidateStart >= 0 && endCandidateEnd <= MINUTES_PER_DAY) {
      const dist = Math.abs(rawEnd - target.minute);
      if (dist <= threshold) {
        candidates.push({
          edge: 'end',
          target,
          distance: dist,
          interval: { startMinute: endCandidateStart, endMinute: endCandidateEnd },
        });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      // 1. Closest distance
      if (Math.abs(a.distance - b.distance) > 1e-6) {
        return a.distance - b.distance;
      }
      // 2. Prefer targets that align with 15-minute grid
      const aOnGrid = a.target.minute % 15 === 0;
      const bOnGrid = b.target.minute % 15 === 0;
      if (aOnGrid !== bOnGrid) {
        return aOnGrid ? -1 : 1;
      }
      // 3. Prefer event boundary over working hours
      const aIsEvent = a.target.type.startsWith('event');
      const bIsEvent = b.target.type.startsWith('event');
      if (aIsEvent !== bIsEvent) {
        return aIsEvent ? -1 : 1;
      }
      // 4. Prefer start edge over end edge
      if (a.edge !== b.edge) {
        return a.edge === 'start' ? -1 : 1;
      }
      // 5. Deterministic target minute
      return a.target.minute - b.target.minute;
    });

    const best = candidates[0]!;
    return {
      interval: best.interval,
      snap: {
        edge: best.edge,
        target: best.target,
        snappedMinute: best.target.minute,
      },
    };
  }

  return {
    interval: moveMinuteInterval(params.originalMinutes, params.deltaMinutes),
    snap: null,
  };
}

export function snapResizeInterval(params: {
  originalMinutes: MinuteInterval;
  edge: ResizeEdge;
  rawPointerMinute: number;
  targets: MagneticTarget[];
  thresholdMinutes?: number;
  minDurationMinutes?: number;
}): SnapResizeResult {
  const threshold = params.thresholdMinutes ?? DEFAULT_MAGNETIC_THRESHOLD_MINUTES;
  const minDuration = params.minDurationMinutes ?? MIN_RESIZE_DURATION_MINUTES;

  interface ResizeCandidate {
    target: MagneticTarget;
    distance: number;
    interval: MinuteInterval;
  }

  const candidates: ResizeCandidate[] = [];

  if (params.edge === 'start') {
    const fixedEnd = params.originalMinutes.endMinute;
    for (const target of params.targets) {
      const candidateStart = target.minute;
      if (candidateStart >= 0 && fixedEnd - candidateStart >= minDuration) {
        const dist = Math.abs(params.rawPointerMinute - target.minute);
        if (dist <= threshold) {
          candidates.push({
            target,
            distance: dist,
            interval: { startMinute: candidateStart, endMinute: fixedEnd },
          });
        }
      }
    }
  } else {
    const fixedStart = params.originalMinutes.startMinute;
    for (const target of params.targets) {
      const candidateEnd = target.minute;
      if (candidateEnd <= MINUTES_PER_DAY && candidateEnd - fixedStart >= minDuration) {
        const dist = Math.abs(params.rawPointerMinute - target.minute);
        if (dist <= threshold) {
          candidates.push({
            target,
            distance: dist,
            interval: { startMinute: fixedStart, endMinute: candidateEnd },
          });
        }
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      // 1. Closest distance
      if (Math.abs(a.distance - b.distance) > 1e-6) {
        return a.distance - b.distance;
      }
      // 2. Prefer targets that align with 15-minute grid
      const aOnGrid = a.target.minute % 15 === 0;
      const bOnGrid = b.target.minute % 15 === 0;
      if (aOnGrid !== bOnGrid) {
        return aOnGrid ? -1 : 1;
      }
      // 3. Prefer event boundary over working hours
      const aIsEvent = a.target.type.startsWith('event');
      const bIsEvent = b.target.type.startsWith('event');
      if (aIsEvent !== bIsEvent) {
        return aIsEvent ? -1 : 1;
      }
      // 4. Deterministic target minute
      return a.target.minute - b.target.minute;
    });

    const best = candidates[0]!;
    return {
      interval: best.interval,
      snap: {
        edge: params.edge,
        target: best.target,
        snappedMinute: best.target.minute,
      },
    };
  }

  return {
    interval: resizeMinuteInterval(params.originalMinutes, params.edge, params.rawPointerMinute),
    snap: null,
  };
}
