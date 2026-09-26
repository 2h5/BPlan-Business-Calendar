import { describe, expect, it } from 'vitest';

import { formatDuration, formatEventTime, formatHour, formatMinute } from './timeline-format';

describe('timeline formatting', () => {
  it('labels gutter hours for both hour cycles', () => {
    expect(formatHour(0, 'h12')).toBe('12 AM');
    expect(formatHour(9, 'h12')).toBe('9 AM');
    expect(formatHour(12, 'h12')).toBe('12 PM');
    expect(formatHour(17, 'h12')).toBe('5 PM');
    expect(formatHour(0, 'h23')).toBe('00');
    expect(formatHour(17, 'h23')).toBe('17');
  });

  it('formats grid minutes, including the end of the day', () => {
    expect(formatMinute(0, 'h12')).toBe('12:00 AM');
    expect(formatMinute(9 * 60 + 15, 'h12')).toBe('9:15 AM');
    expect(formatMinute(13 * 60 + 5, 'h12')).toBe('1:05 PM');
    expect(formatMinute(9 * 60 + 15, 'h23')).toBe('09:15');
    expect(formatMinute(24 * 60, 'h12')).toBe('12:00 AM');
    expect(formatMinute(24 * 60, 'h23')).toBe('24:00');
  });

  it('formats durations as minutes, hours, or both', () => {
    expect(formatDuration(15)).toBe('15m');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('formats an instant in the calendar time zone', () => {
    const instant = Date.parse('2026-09-15T14:00:00.000Z');
    expect(formatEventTime(instant, 'America/New_York', 'h12')).toBe('10:00 AM');
    expect(formatEventTime(instant, 'America/New_York', 'h23')).toBe('10:00');
  });
});
