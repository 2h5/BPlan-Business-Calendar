import { addZonedDays, startOfZonedDay } from '@cal/domain';

export const TODAY_CLOCK_REFRESH_MS = 60_000;

/** Return the next midnight in the supplied profile timezone. */
export function nextLocalMidnight(now: Date, timeZone: string): Date {
  return addZonedDays(startOfZonedDay(now, timeZone), 1, timeZone);
}

/** Compute one timeout duration; callers should schedule again after it fires. */
export function millisecondsUntilNextLocalMidnight(now: Date, timeZone: string): number {
  return Math.max(1, nextLocalMidnight(now, timeZone).getTime() - now.getTime());
}

/**
 * Keep current-time summaries moving during the day without polling more than
 * once per minute. Schedule the local-midnight boundary as soon as it is near.
 */
export function millisecondsUntilNextClockUpdate(now: Date, timeZone: string): number {
  return Math.min(TODAY_CLOCK_REFRESH_MS, millisecondsUntilNextLocalMidnight(now, timeZone) + 50);
}
