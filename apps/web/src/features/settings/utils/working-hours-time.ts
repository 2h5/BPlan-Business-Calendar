const LAST_REPRESENTABLE_MINUTE = 23 * 60 + 59;

/** Convert a domain minute to a valid HTML time value. 1440 is shown separately as end-of-day. */
export function minuteOfDayToTimeInput(minutes: number): string {
  const displayMinutes = minutes === 24 * 60 ? LAST_REPRESENTABLE_MINUTE : minutes;
  if (!Number.isInteger(displayMinutes) || displayMinutes < 0 || displayMinutes > 1439) return '';
  return `${String(Math.floor(displayMinutes / 60)).padStart(2, '0')}:${String(displayMinutes % 60).padStart(2, '0')}`;
}

export function timeInputToMinute(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : 0;
}
