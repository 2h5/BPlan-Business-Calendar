import type { HourCycle } from '@cal/schemas';

const LAST_REPRESENTABLE_MINUTE = 23 * 60 + 59;
const OPTION_STEP_MINUTES = 15;

export interface WorkingHourOption {
  value: string;
  label: string;
}

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

/** Label a wall-clock "HH:MM" value the same way calendar event cards label times. */
export function formatWorkingHourLabel(value: string, hourCycle: HourCycle): string {
  const minute = timeInputToMinute(value);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle,
  }).format(new Date(Date.UTC(1970, 0, 1, Math.floor(minute / 60), minute % 60)));
}

/** 15-minute options for the day, plus the current value if it falls off the grid. */
export function buildWorkingHourOptions(
  hourCycle: HourCycle,
  currentValue: string,
): WorkingHourOption[] {
  const values: string[] = [];
  for (let minute = 0; minute < 24 * 60; minute += OPTION_STEP_MINUTES) {
    values.push(minuteOfDayToTimeInput(minute));
  }
  if (currentValue && !values.includes(currentValue)) {
    values.push(currentValue);
    values.sort();
  }
  return values.map((value) => ({ value, label: formatWorkingHourLabel(value, hourCycle) }));
}

/**
 * Parse what a user typed into a working-hours field: "9", "930", "9:30", "9:30 pm", "5p", "17:00".
 * Returns an "HH:MM" value, or null when the text is not a time.
 */
export function parseTypedWorkingHour(text: string): string | null {
  const match = /^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/.exec(
    text.toLowerCase().replace(/[\s.]/g, ''),
  );
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? '0');
  const meridiem = match[3];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem.startsWith('p') ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
