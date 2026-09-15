import { addZonedDays, minuteOfDay } from '@cal/domain';

import { dateKeyToInstant } from './calendar-window';
import { MINUTES_PER_DAY, type MinuteInterval } from './event-resize';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

export interface ConflictCandidate {
  key: string;
  title: string;
  startMinute: number;
  endMinute: number;
}

/**
 * Deterministic interval overlap check:
 * A conflict exists when proposedStart < otherEnd AND proposedEnd > otherStart.
 * Exact boundary contact (e.g. 10:00–11:00 and 11:00–12:00) does NOT conflict.
 */
export function hasIntervalOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  return a.startMinute < b.endMinute && a.endMinute > b.startMinute;
}

/**
 * Collects conflict candidates from visible timed occurrences on the active day,
 * explicitly ignoring the active occurrence being manipulated.
 */
export function collectConflictCandidates(params: {
  occurrences: EventOccurrence[];
  activeOccurrenceKey: string | null;
  dateKey: string;
  timeZone: string;
}): ConflictCandidate[] {
  const { occurrences, activeOccurrenceKey, dateKey, timeZone } = params;
  const dayStartInstant = dateKeyToInstant(dateKey, timeZone);
  const dayStart = dayStartInstant.getTime();
  const dayEnd = addZonedDays(dayStartInstant, 1, timeZone).getTime();

  const candidates: ConflictCandidate[] = [];

  for (const occ of occurrences) {
    if (occ.event.allDay) continue;
    if (activeOccurrenceKey !== null && occ.key === activeOccurrenceKey) continue;
    if (occ.end <= dayStart || occ.start >= dayEnd) continue;

    const startMinute = occ.start <= dayStart ? 0 : minuteOfDay(new Date(occ.start), timeZone);
    const endMinute =
      occ.end >= dayEnd ? MINUTES_PER_DAY : minuteOfDay(new Date(occ.end), timeZone);

    if (endMinute > startMinute) {
      candidates.push({
        key: occ.key,
        title: occ.event.title,
        startMinute,
        endMinute,
      });
    }
  }

  return candidates;
}

/**
 * Finds all candidate events on the day that overlap with the proposed interval.
 */
export function findConflictingCandidates(
  proposedInterval: MinuteInterval,
  candidates: ConflictCandidate[],
): ConflictCandidate[] {
  return candidates.filter((candidate) => hasIntervalOverlap(proposedInterval, candidate));
}

/**
 * Returns true if the proposed interval overlaps any candidate event on the day.
 */
export function hasConflict(
  proposedInterval: MinuteInterval,
  candidates: ConflictCandidate[],
): boolean {
  return candidates.some((candidate) => hasIntervalOverlap(proposedInterval, candidate));
}
