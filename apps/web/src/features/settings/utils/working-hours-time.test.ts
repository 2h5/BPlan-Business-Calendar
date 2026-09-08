import { describe, expect, it } from 'vitest';

import { minuteOfDayToTimeInput, timeInputToMinute } from './working-hours-time';

describe('working-hours time input conversion', () => {
  it('never emits invalid 24:00 while retaining an end-of-day sentinel in domain state', () => {
    expect(minuteOfDayToTimeInput(24 * 60)).toBe('23:59');
    expect(timeInputToMinute(minuteOfDayToTimeInput(24 * 60))).toBe(23 * 60 + 59);
  });

  it('round-trips ordinary minute values', () => {
    expect(timeInputToMinute(minuteOfDayToTimeInput(9 * 60 + 15))).toBe(9 * 60 + 15);
  });
});
