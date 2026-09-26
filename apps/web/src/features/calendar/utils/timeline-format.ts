import type { HourCycle } from '@cal/schemas';

const pad = (n: number) => String(n).padStart(2, '0');

/** Hour-gutter label: `09` in 24-hour time, `9 AM` in 12-hour time. */
export function formatHour(hour: number, hourCycle: HourCycle): string {
  if (hourCycle === 'h23') return String(hour).padStart(2, '0');
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** Wall-clock time of an instant in the calendar's time zone. */
export function formatEventTime(instant: number, timeZone: string, hourCycle: HourCycle): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hourCycle,
  }).format(new Date(instant));
}

/** A minute of the grid day (0–1440) as a clock label; 1440 is the end of the day. */
export function formatMinute(minute: number, hourCycle: HourCycle): string {
  if (minute === 24 * 60) return hourCycle === 'h23' ? '24:00' : '12:00 AM';
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  if (hourCycle === 'h23') return `${pad(h)}:${pad(m)}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${pad(m)} ${period}`;
}

/** Compact duration badge: `45m`, `2h`, `1h 30m`. */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}
