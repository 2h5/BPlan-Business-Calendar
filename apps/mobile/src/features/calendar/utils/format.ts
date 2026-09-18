import { addZonedDays } from '@cal/domain';

/**
 * The short weekday and date a dragged month bar is pointing at — "Fri 25".
 *
 * Deliberately not the time: a month cell says nothing about when in the day
 * an event happens, and a drag across the grid does not change it.
 */
export function formatShortDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    timeZone,
  }).format(instant);
}

/** Where an event lands after being dragged `dayDelta` whole days. */
export function formatDayShiftTarget(start: number, dayDelta: number, timeZone: string): string {
  return formatShortDate(addZonedDays(new Date(start), dayDelta, timeZone), timeZone);
}
