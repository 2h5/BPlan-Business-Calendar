import { describe, expect, it } from 'vitest';

import {
  buildWorkingHourOptions,
  formatWorkingHourLabel,
  minuteOfDayToTimeInput,
  parseTypedWorkingHour,
  timeInputToMinute,
} from './working-hours-time';

describe('working-hours time input conversion', () => {
  it('never emits invalid 24:00 while retaining an end-of-day sentinel in domain state', () => {
    expect(minuteOfDayToTimeInput(24 * 60)).toBe('23:59');
    expect(timeInputToMinute(minuteOfDayToTimeInput(24 * 60))).toBe(23 * 60 + 59);
  });

  it('round-trips ordinary minute values', () => {
    expect(timeInputToMinute(minuteOfDayToTimeInput(9 * 60 + 15))).toBe(9 * 60 + 15);
  });
});

describe('working-hours option labels', () => {
  it('matches the calendar card time format for each hour cycle', () => {
    expect(formatWorkingHourLabel('09:00', 'h12')).toBe('9:00 AM');
    expect(formatWorkingHourLabel('17:30', 'h12')).toBe('5:30 PM');
    expect(formatWorkingHourLabel('09:00', 'h23')).toBe('09:00');
  });

  it('keeps an off-grid current value selectable', () => {
    const options = buildWorkingHourOptions('h12', '23:59');
    expect(options).toHaveLength(24 * 4 + 1);
    expect(options.at(-1)).toEqual({ value: '23:59', label: '11:59 PM' });
  });
});

describe('typed working-hours parsing', () => {
  it.each([
    ['9', '09:00'],
    ['930', '09:30'],
    ['9:30', '09:30'],
    ['9:30 pm', '21:30'],
    ['5p', '17:00'],
    ['12 am', '00:00'],
    ['12pm', '12:00'],
    ['17:45', '17:45'],
    [' 9:00 A.M. ', '09:00'],
  ])('reads %j as %s', (typed, expected) => {
    expect(parseTypedWorkingHour(typed)).toBe(expected);
  });

  it.each(['', 'noon', '25:00', '9:75', '13pm', '0am'])('rejects %j', (typed) => {
    expect(parseTypedWorkingHour(typed)).toBeNull();
  });
});
