import { normalizeWorkspaceOrder } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { dropIndex, mergeVisibleOrder, moveItem, shiftFor } from './reorder';

describe('moveItem', () => {
  it('moves an item forwards and backwards without mutating the input', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('dropIndex', () => {
  it('rounds to the nearest slot and stays inside the list', () => {
    expect(dropIndex(1, 20, 36, 4)).toBe(2);
    expect(dropIndex(1, 17, 36, 4)).toBe(1);
    expect(dropIndex(1, -500, 36, 4)).toBe(0);
    expect(dropIndex(1, 500, 36, 4)).toBe(3);
  });
});

describe('shiftFor', () => {
  it('slides the items between the origin and the target toward the gap', () => {
    // Dragging index 0 down to index 2: items 1 and 2 move up.
    expect([0, 1, 2, 3].map((index) => shiftFor(index, 0, 2, 36))).toEqual([0, -36, -36, 0]);
    // Dragging index 3 up to index 1: items 1 and 2 move down.
    expect([0, 1, 2, 3].map((index) => shiftFor(index, 3, 1, 36))).toEqual([0, 36, 36, 0]);
  });
});

describe('mergeVisibleOrder', () => {
  it('keeps hidden items in their slots', () => {
    expect(
      mergeVisibleOrder(['today', 'search', 'calendar', 'tasks'], ['tasks', 'today', 'calendar']),
    ).toEqual(['tasks', 'search', 'today', 'calendar']);
  });
});

describe('normalizeWorkspaceOrder', () => {
  it('drops unknown and repeated tabs and appends missing ones in default order', () => {
    expect(normalizeWorkspaceOrder(['search', 'retired', 'search', 'tasks', 7])).toEqual([
      'search',
      'tasks',
      'today',
      'calendar',
    ]);
  });
});
