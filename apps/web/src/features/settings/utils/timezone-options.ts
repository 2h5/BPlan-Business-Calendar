export const COMMON_TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

export interface TimezoneOption {
  value: string;
  label: string;
}

export interface BuildTimezoneOptionsParams {
  currentTimezone?: string | null;
  savedTimezone?: string | null;
  deviceTimezone?: string | null;
  commonTimezones?: readonly string[];
}

export function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Builds a deduplicated list of selectable timezone options.
 *
 * Priorities:
 * 1. currently selected/draft timezone
 * 2. currently saved profile timezone
 * 3. browser/device timezone
 * 4. common timezones list
 *
 * Preserves canonical IANA strings and ensures any custom/saved timezone remains selectable.
 */
export function buildTimezoneOptions({
  currentTimezone,
  savedTimezone,
  deviceTimezone = getDeviceTimezone(),
  commonTimezones = COMMON_TIME_ZONES,
}: BuildTimezoneOptionsParams = {}): TimezoneOption[] {
  const candidates = [currentTimezone, savedTimezone, deviceTimezone, ...commonTimezones].filter(
    (tz): tz is string => typeof tz === 'string' && tz.trim().length > 0,
  );

  const unique = [...new Set(candidates)];

  return unique.map((zone) => ({
    value: zone,
    label: zone,
  }));
}
