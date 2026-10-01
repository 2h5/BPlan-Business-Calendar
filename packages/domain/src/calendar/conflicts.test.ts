import { describe, expect, it } from 'vitest';

import { findConflictingItems } from './conflicts';

interface Item {
  id: string;
  start: number;
  end: number;
  allDay?: boolean;
}

const at = (hour: number, minute = 0): number => Date.UTC(2026, 8, 30, hour, minute);
const item = (id: string, start: number, end: number, allDay = false): Item => ({
  id,
  start,
  end,
  allDay,
});
const intervalOf = (value: Item) => (value.allDay ? null : value);
const ids = (set: Set<Item>) => [...set].map((value) => value.id).sort();

describe('findConflictingItems', () => {
  it('flags both sides of an overlap', () => {
    const items = [
      item('planning', at(10), at(12)),
      item('call', at(11), at(11, 30)),
      item('lunch', at(12, 30), at(13, 30)),
    ];
    expect(ids(findConflictingItems(items, intervalOf))).toEqual(['call', 'planning']);
  });

  it('does not treat back-to-back events as a conflict', () => {
    const items = [item('a', at(9), at(10)), item('b', at(10), at(11))];
    expect(findConflictingItems(items, intervalOf).size).toBe(0);
  });

  it('catches an event nested inside a longer one that started earlier', () => {
    const items = [
      item('workshop', at(9), at(17)),
      item('standup', at(9), at(9, 15)),
      item('review', at(15), at(16)),
    ];
    expect(ids(findConflictingItems(items, intervalOf))).toEqual(['review', 'standup', 'workshop']);
  });

  it('ignores items the caller rules out', () => {
    const items = [item('offsite', at(0), at(24), true), item('call', at(11), at(12))];
    expect(findConflictingItems(items, intervalOf).size).toBe(0);
  });
});
