export interface TimePickerOption {
  value: string;
  label: string;
  detail?: string;
}

export const pad = (n: number) => String(n).padStart(2, '0');

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h ?? 9) * 60 + (m ?? 0) + minutes;
  const newHour = Math.floor(total / 60) % 24;
  const newMin = total % 60;
  return `${pad(newHour)}:${pad(newMin)}`;
}

export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatTimeDisplay(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')}${period}`;
}

export function createTimeOptions(): TimePickerOption[] {
  const options: TimePickerOption[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const val = `${pad(h)}:${pad(m)}`;
      options.push({
        value: val,
        label: formatTimeDisplay(val),
      });
    }
  }
  return options;
}

export function withCustomTimeOption(
  timeOptions: readonly TimePickerOption[],
  selectedTime: string,
): readonly TimePickerOption[] {
  if (selectedTime && !timeOptions.some((option) => option.value === selectedTime)) {
    const custom = { value: selectedTime, label: formatTimeDisplay(selectedTime) };
    return [...timeOptions, custom].sort((a, b) => a.value.localeCompare(b.value));
  }
  return timeOptions;
}

export function formatDurationBetweenTimes(startTime: string, endTime: string): string | undefined {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  const duration =
    (endHour ?? 0) * 60 + (endMinute ?? 0) - ((startHour ?? 0) * 60 + (startMinute ?? 0));
  if (duration <= 0) return undefined;
  if (duration < 60) return `${duration} min${duration === 1 ? '' : 's'}`;
  if (duration % 60 === 0) {
    const hours = duration / 60;
    return `${hours} hr${hours === 1 ? '' : 's'}`;
  }
  if (duration % 30 === 0) return `${duration / 60} hrs`;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  return `${hours} hr ${minutes} mins`;
}

export function createEndTimePickerOptions(
  startTime: string,
  endTime: string,
  endTimeOptions: readonly TimePickerOption[],
): TimePickerOption[] {
  return endTimeOptions
    .map((option) => ({
      ...option,
      detail: formatDurationBetweenTimes(startTime, option.value),
    }))
    .filter((option) => option.detail || option.value === endTime);
}
