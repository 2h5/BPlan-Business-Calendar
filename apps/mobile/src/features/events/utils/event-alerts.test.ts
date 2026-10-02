import { describe, expect, it } from 'vitest';

import { ALERT_PRESETS, alertLabel, alertOptions, toggleAlert } from './event-alerts';

describe('alertLabel', () => {
  it.each([
    [0, 'At start'],
    [5, '5 min'],
    [45, '45 min'],
    [60, '1 hour'],
    [120, '2 hours'],
    [90, '1h 30m'],
    [1440, '1 day'],
    [2880, '2 days'],
  ])('labels %i minutes as "%s"', (minutes, label) => {
    expect(alertLabel(minutes)).toBe(label);
  });
});

describe('alertOptions', () => {
  it('returns the presets when every selected alert is a preset', () => {
    expect(alertOptions([10, 60])).toEqual(ALERT_PRESETS);
  });

  it('adds a non-preset alert in order so it can be turned off', () => {
    const options = alertOptions([10, 90]);

    expect(options.map((option) => option.minutes)).toEqual([0, 5, 10, 15, 30, 60, 90, 1440]);
    expect(options.find((option) => option.minutes === 90)?.label).toBe('1h 30m');
  });

  it('does not mutate the presets', () => {
    alertOptions([7]);

    expect(ALERT_PRESETS).toHaveLength(7);
  });
});

describe('toggleAlert', () => {
  it('turns an alert on in ascending order', () => {
    expect(toggleAlert([10, 60], 30)).toEqual([10, 30, 60]);
  });

  it('turns an alert off', () => {
    expect(toggleAlert([10, 30, 60], 30)).toEqual([10, 60]);
  });

  it('does not mutate its input', () => {
    const alerts = [60, 10];
    toggleAlert(alerts, 5);

    expect(alerts).toEqual([60, 10]);
  });
});
