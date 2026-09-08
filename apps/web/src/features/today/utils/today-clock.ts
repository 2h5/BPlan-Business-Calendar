import { addZonedDays, startOfZonedDay } from '@cal/domain';

/** Return the next midnight in the supplied profile timezone. */
export function nextLocalMidnight(now: Date, timeZone: string): Date {
  return addZonedDays(startOfZonedDay(now, timeZone), 1, timeZone);
}

/** Compute one timeout duration; callers should schedule again after it fires. */
export function millisecondsUntilNextLocalMidnight(now: Date, timeZone: string): number {
  return Math.max(1, nextLocalMidnight(now, timeZone).getTime() - now.getTime());
}
