import { addZonedDays, getZonedParts, toZonedDateKey } from '@cal/domain';

export interface NewEventSlotDefaults {
  dateKey: string;
  startMinute: number;
  endMinute: number;
  startTime: string;
  endTime: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

function minuteToTime(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export function getNewEventSlotDefaults(
  now: Date,
  timeZone: string,
  durationMinutes: number,
): NewEventSlotDefaults {
  const parts = getZonedParts(now, timeZone);
  const currentMinute = parts.hour * 60 + parts.minute + (parts.second > 0 ? 1 : 0);
  let startMinute = Math.ceil(currentMinute / 15) * 15;
  let dateKey = toZonedDateKey(now, timeZone);

  if (startMinute >= 24 * 60 || startMinute + durationMinutes > 24 * 60) {
    dateKey = toZonedDateKey(addZonedDays(now, 1, timeZone), timeZone);
    startMinute = 0;
  }

  const endMinute = startMinute + durationMinutes;
  return {
    dateKey,
    startMinute,
    endMinute,
    startTime: minuteToTime(startMinute),
    endTime: minuteToTime(endMinute),
  };
}
