import { addZonedDays, getZonedParts, startOfZonedDay, zonedWallClockToUtc } from '@cal/domain';

/** The one-tap due dates offered wherever a task is captured quickly. */
export type DuePreset = 'none' | 'today' | 'tomorrow' | 'next-week';

export const DUE_PRESET_LABELS: Record<DuePreset, string> = {
  none: 'Someday',
  today: 'Today',
  tomorrow: 'Tomorrow',
  'next-week': 'Next week',
};

const OFFSET_DAYS: Record<Exclude<DuePreset, 'none'>, number> = {
  today: 0,
  tomorrow: 1,
  'next-week': 7,
};

/** A preset as a UTC ISO due date, or null for no date. Date-only, so no time is implied. */
export function resolveDuePreset(
  preset: DuePreset,
  timeZone: string,
  now = new Date(),
): string | null {
  if (preset === 'none') return null;

  const day = addZonedDays(startOfZonedDay(now, timeZone), OFFSET_DAYS[preset], timeZone);
  const parts = getZonedParts(day, timeZone);
  // Local noon, so a later time-zone change cannot slide it into another day.
  return zonedWallClockToUtc(
    { year: parts.year, month: parts.month, day: parts.day, hour: 12, minute: 0 },
    timeZone,
  ).toISOString();
}
