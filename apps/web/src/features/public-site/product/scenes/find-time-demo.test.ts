import { describe, expect, it } from 'vitest';

import { buildFindTimeDemo, FIND_TIME_DAY } from './find-time-demo';
import { eventsOnDay } from '../demo-data';

describe('buildFindTimeDemo', () => {
  const demo = buildFindTimeDemo();

  it('reads the prompt through the intent parser', () => {
    expect(demo.title).toBe('Call with Sam');
    expect(demo.durationMinutes).toBe(30);
    expect(demo.chips).toEqual(['30 min', 'Tomorrow', 'Afternoon']);
  });

  it('offers three afternoon slots that never touch an existing event', () => {
    const busy = eventsOnDay(FIND_TIME_DAY);
    expect(demo.suggestions).toHaveLength(3);
    for (const slot of demo.suggestions) {
      expect(slot.start).toBeGreaterThanOrEqual(12 * 60);
      expect(slot.end).toBeLessThanOrEqual(17 * 60);
      expect(busy.some((event) => slot.start < event.end && event.start < slot.end)).toBe(false);
    }
  });
});
