import { describe, expect, it } from 'vitest';

import { buildTimezoneOptions, COMMON_TIME_ZONES, getDeviceTimezone } from './timezone-options';

describe('buildTimezoneOptions', () => {
  it('contains all common timezones in order when no custom timezone is given', () => {
    const options = buildTimezoneOptions({
      currentTimezone: 'UTC',
      deviceTimezone: 'UTC',
    });

    const values = options.map((opt) => opt.value);
    for (const commonZone of COMMON_TIME_ZONES) {
      expect(values).toContain(commonZone);
    }
  });

  it('includes the device timezone', () => {
    const options = buildTimezoneOptions({
      currentTimezone: 'UTC',
      deviceTimezone: 'Europe/Paris',
    });

    const values = options.map((opt) => opt.value);
    expect(values).toContain('Europe/Paris');
  });

  it('retains a saved/draft timezone even if it is not part of the common list', () => {
    const options = buildTimezoneOptions({
      currentTimezone: 'Pacific/Auckland',
      savedTimezone: 'Pacific/Honolulu',
      deviceTimezone: 'America/New_York',
    });

    const values = options.map((opt) => opt.value);
    expect(values).toContain('Pacific/Auckland');
    expect(values).toContain('Pacific/Honolulu');
    expect(values[0]).toBe('Pacific/Auckland');
    expect(values[1]).toBe('Pacific/Honolulu');
  });

  it('deduplicates options without repeat entries', () => {
    const options = buildTimezoneOptions({
      currentTimezone: 'America/New_York',
      savedTimezone: 'America/New_York',
      deviceTimezone: 'America/New_York',
    });

    const newYorkCount = options.filter((opt) => opt.value === 'America/New_York').length;
    expect(newYorkCount).toBe(1);
  });

  it('formats each option with canonical IANA value and label', () => {
    const options = buildTimezoneOptions({
      currentTimezone: 'America/Chicago',
      deviceTimezone: 'America/Chicago',
    });

    const chicago = options.find((opt) => opt.value === 'America/Chicago');
    expect(chicago).toEqual({
      value: 'America/Chicago',
      label: 'America/Chicago',
    });
  });

  it('getDeviceTimezone returns a valid fallback string without throwing', () => {
    const tz = getDeviceTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
});
