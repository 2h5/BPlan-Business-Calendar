import { describe, expect, it } from 'vitest';

import { formatSlot, getEventDateKey } from './find-time-format';

describe('Find Time display formatting', () => {
  it('uses the UTC date for calendar links, including across local day boundaries', () => {
    expect(getEventDateKey('2026-09-10T00:30:00Z')).toBe('2026-09-10');
    expect(getEventDateKey('2026-09-09T20:30:00-04:00')).toBe('2026-09-10');
    expect(getEventDateKey()).toBe('');
    expect(getEventDateKey('not a date')).toBe('');
  });

  it('formats the start day and both clocks in en-US using the supplied timezone', () => {
    expect(formatSlot('2026-09-10T16:15:00Z', '2026-09-10T16:30:00Z', 'America/New_York')).toBe(
      'Thu, Sep 10 · 12:15 PM – 12:30 PM',
    );
    expect(formatSlot('2026-09-10T16:15:00Z', '2026-09-10T16:30:00Z')).toBe(
      'Thu, Sep 10 · 4:15 PM – 4:30 PM',
    );
  });

  it('returns an empty string for missing dates, invalid dates, and invalid timezones', () => {
    expect(formatSlot(undefined, '2026-09-10T16:30:00Z')).toBe('');
    expect(formatSlot('2026-09-10T16:15:00Z')).toBe('');
    expect(formatSlot('invalid', '2026-09-10T16:30:00Z')).toBe('');
    expect(formatSlot('2026-09-10T16:15:00Z', 'invalid')).toBe('');
    expect(formatSlot('2026-09-10T16:15:00Z', '2026-09-10T16:30:00Z', 'Invalid/Zone')).toBe('');
  });
});
