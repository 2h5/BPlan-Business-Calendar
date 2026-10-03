/**
 * Display labels derived from date keys alone.
 *
 * A date key is already a local calendar day, so formatting it as a UTC
 * midnight is exact in every zone — no instant ever needs converting.
 */

const fromKey = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
};

const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const dayMonthFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
// en-US for the three-letter month: en-GB writes September as "Sept".
const shortMonthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const shortDayMonth = (dateKey: string): string =>
  `${Number(dateKey.slice(8, 10))} ${shortMonthFormat.format(fromKey(dateKey))}`;
const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });

/** "2026-10-02" → "Friday" */
export const weekdayLabel = (dateKey: string): string => weekdayFormat.format(fromKey(dateKey));

/** "2026-10-02" → "2 October" */
export const dayMonthLabel = (dateKey: string): string => dayMonthFormat.format(fromKey(dateKey));

/** "2026-10-02" → "October" */
export const monthLabel = (dateKey: string): string => monthFormat.format(fromKey(dateKey));

/**
 * "2026-09-28", "2026-10-04" → "28 Sep – 4 Oct"; within one month the month
 * is said once: "5 – 11 Oct".
 */
export function weekRangeLabel(firstKey: string, lastKey: string): string {
  const first =
    firstKey.slice(0, 7) === lastKey.slice(0, 7)
      ? String(Number(firstKey.slice(8, 10)))
      : shortDayMonth(firstKey);
  const last = shortDayMonth(lastKey);
  return `${first} – ${last}`;
}

const INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Weekday initials in display order for a week starting on `weekStartsOn` (0 = Sunday). */
export function weekdayInitials(weekStartsOn: number): string[] {
  return Array.from({ length: 7 }, (_, offset) => INITIALS[(weekStartsOn + offset) % 7] ?? '');
}
