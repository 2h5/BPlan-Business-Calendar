import { describe, expect, it } from 'vitest';

import { formatDurationBetweenTimes } from './QuickCreatePickers';

describe('QuickCreate picker duration labels', () => {
  it('formats Google Calendar-style end-time durations', () => {
    expect(formatDurationBetweenTimes('19:30', '20:00')).toBe('30 mins');
    expect(formatDurationBetweenTimes('19:30', '20:15')).toBe('45 mins');
    expect(formatDurationBetweenTimes('19:30', '20:30')).toBe('1 hr');
    expect(formatDurationBetweenTimes('19:30', '21:00')).toBe('1.5 hrs');
    expect(formatDurationBetweenTimes('19:30', '21:30')).toBe('2 hrs');
  });

  it('omits duration text for non-future same-day options', () => {
    expect(formatDurationBetweenTimes('19:30', '19:30')).toBeUndefined();
    expect(formatDurationBetweenTimes('19:30', '18:30')).toBeUndefined();
  });
});
