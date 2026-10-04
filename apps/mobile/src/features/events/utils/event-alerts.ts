export interface AlertOption {
  label: string;
  minutes: number;
}

/** Alert offsets offered in the editor, in minutes before the start. */
export const ALERT_PRESETS: readonly AlertOption[] = [
  { label: 'At start', minutes: 0 },
  { label: '5 min', minutes: 5 },
  { label: '10 min', minutes: 10 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
];

/** A label for an alert offset that is not one of the presets, e.g. one synced from Google. */
export function alertLabel(minutes: number): string {
  if (minutes === 0) return 'At start';
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * The presets plus any alert already on the event that is not a preset, so
 * every alert that will fire is visible and can be turned off.
 */
export function alertOptions(selected: readonly number[]): AlertOption[] {
  const extra = selected
    .filter((minutes) => !ALERT_PRESETS.some((preset) => preset.minutes === minutes))
    .map((minutes) => ({ label: alertLabel(minutes), minutes }));
  return [...ALERT_PRESETS, ...extra].sort((a, b) => a.minutes - b.minutes);
}

/** Turns one alert on or off, keeping the list in ascending order. */
export function toggleAlert(alerts: readonly number[], minutes: number): number[] {
  return alerts.includes(minutes)
    ? alerts.filter((existing) => existing !== minutes)
    : [...alerts, minutes].sort((a, b) => a - b);
}
