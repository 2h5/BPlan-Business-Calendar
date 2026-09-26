import { describe, expect, it } from 'vitest';

import {
  addMinutesToTime,
  createEndTimePickerOptions,
  createTimeOptions,
  formatDateDisplay,
  formatDurationBetweenTimes,
  formatTimeDisplay,
  pad,
  withCustomTimeOption,
} from './quick-create-time';

describe('Quick Create time options', () => {
  it('builds the ordered 15-minute grid from midnight through 23:45', () => {
    const options = createTimeOptions();
    expect(options).toHaveLength(96);
    expect(options[0]).toEqual({ value: '00:00', label: '12:00am' });
    expect(options.at(-1)).toEqual({ value: '23:45', label: '11:45pm' });
    expect(options.map((option) => option.value)).toEqual(
      [...options.map((option) => option.value)].sort(),
    );
  });

  it('uses lowercase 12-hour labels without a leading hour zero', () => {
    expect(formatTimeDisplay('00:00')).toBe('12:00am');
    expect(formatTimeDisplay('09:15')).toBe('9:15am');
    expect(formatTimeDisplay('12:00')).toBe('12:00pm');
    expect(formatTimeDisplay('15:30')).toBe('3:30pm');
  });

  it('inserts a non-grid start time once in lexicographic order', () => {
    const options = withCustomTimeOption(createTimeOptions(), '10:07');
    expect(options.filter((option) => option.value === '10:07')).toEqual([
      { value: '10:07', label: '10:07am' },
    ]);
    expect(options.slice(39, 43).map((option) => option.value)).toEqual([
      '09:45',
      '10:00',
      '10:07',
      '10:15',
    ]);
  });

  it('does not duplicate an existing quarter-hour value', () => {
    const grid = createTimeOptions();
    const options = withCustomTimeOption(grid, '10:15');
    expect(options).toBe(grid);
    expect(options.filter((option) => option.value === '10:15')).toHaveLength(1);
  });

  it('inserts a custom end time and attaches its duration detail', () => {
    const endOptions = withCustomTimeOption(createTimeOptions(), '10:07');
    const pickerOptions = createEndTimePickerOptions('10:00', '10:07', endOptions);
    expect(pickerOptions.find((option) => option.value === '10:07')).toEqual({
      value: '10:07',
      label: '10:07am',
      detail: '7 mins',
    });
    expect(pickerOptions.map((option) => option.value).slice(0, 3)).toEqual([
      '10:07',
      '10:15',
      '10:30',
    ]);
  });

  it('filters non-future same-day end times and keeps future duration labels', () => {
    const options = createEndTimePickerOptions('10:00', '11:00', createTimeOptions());
    expect(options.some((option) => option.value === '09:45')).toBe(false);
    expect(options.some((option) => option.value === '10:00')).toBe(false);
    expect(options.find((option) => option.value === '10:15')?.detail).toBe('15 mins');
    expect(options.find((option) => option.value === '11:00')?.detail).toBe('1 hr');
  });

  it('retains the selected equal or earlier end time without a duration label', () => {
    const grid = createTimeOptions();
    expect(createEndTimePickerOptions('10:00', '10:00', grid)[0]).toEqual({
      value: '10:00',
      label: '10:00am',
      detail: undefined,
    });
    const earlier = createEndTimePickerOptions('10:00', '09:45', grid);
    expect(earlier[0]).toEqual({ value: '09:45', label: '9:45am', detail: undefined });
    expect(earlier.some((option) => option.value === '10:00')).toBe(false);
  });
});

describe('Quick Create date/time formatting', () => {
  it('preserves the picker duration-label cases', () => {
    expect(formatDurationBetweenTimes('19:30', '20:00')).toBe('30 mins');
    expect(formatDurationBetweenTimes('19:30', '20:15')).toBe('45 mins');
    expect(formatDurationBetweenTimes('19:30', '20:30')).toBe('1 hr');
    expect(formatDurationBetweenTimes('19:30', '21:00')).toBe('1.5 hrs');
    expect(formatDurationBetweenTimes('19:30', '21:30')).toBe('2 hrs');
    expect(formatDurationBetweenTimes('19:30', '19:30')).toBeUndefined();
    expect(formatDurationBetweenTimes('19:30', '18:30')).toBeUndefined();
  });

  it('keeps the weekday, month, and numeric day display and invalid fallbacks', () => {
    expect(formatDateDisplay('2026-09-15')).toBe('Tuesday, September 15');
    expect(formatDateDisplay('')).toBe('');
    expect(formatDateDisplay('not-a-date')).toBe('not-a-date');
    expect(formatDateDisplay('2026-xx-15')).toBe('2026-xx-15');
    expect(formatDateDisplay('2026-09-00')).toBe('2026-09-00');
  });

  it('keeps time-label fallbacks and the existing minute wrap behavior', () => {
    expect(formatTimeDisplay('')).toBe('');
    expect(formatTimeDisplay('invalid')).toBe('invalid');
    expect(pad(9)).toBe('09');
    expect(addMinutesToTime('10:00', 75)).toBe('11:15');
    expect(addMinutesToTime('23:45', 30)).toBe('00:15');
  });
});
