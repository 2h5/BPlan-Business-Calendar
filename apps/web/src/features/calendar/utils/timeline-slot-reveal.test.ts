import { describe, expect, it } from 'vitest';

import { scrollTopToRevealSlot } from './timeline-slot-reveal';

const base = { viewportHeight: 700, maxScrollTop: 1000, headerHeight: 100 };

describe('scrollTopToRevealSlot', () => {
  it('leaves the scroll alone when the slot is already visible', () => {
    expect(scrollTopToRevealSlot({ ...base, scrollTop: 400, slotTop: 500, slotBottom: 560 })).toBe(
      null,
    );
  });

  it('scrolls down to a slot below the visible area', () => {
    // 8:45 PM at 54px/hour.
    expect(scrollTopToRevealSlot({ ...base, scrollTop: 0, slotTop: 1120, slotBottom: 1174 })).toBe(
      920,
    );
  });

  it('scrolls up to a slot hidden under the sticky header', () => {
    expect(scrollTopToRevealSlot({ ...base, scrollTop: 600, slotTop: 580, slotBottom: 640 })).toBe(
      380,
    );
  });

  it('clamps to the scrollable range', () => {
    expect(scrollTopToRevealSlot({ ...base, scrollTop: 0, slotTop: 1400, slotBottom: 1450 })).toBe(
      1000,
    );
    expect(scrollTopToRevealSlot({ ...base, scrollTop: 300, slotTop: 60, slotBottom: 120 })).toBe(
      0,
    );
  });
});
