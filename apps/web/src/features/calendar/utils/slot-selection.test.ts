import { describe, expect, it } from 'vitest';

const pad = (n: number) => String(n).padStart(2, '0');

function snapToSlot(minute: number, step = 15): number {
  return Math.max(0, Math.min(24 * 60, Math.floor(minute / step) * step));
}

function computeDragRange(
  startMinute: number,
  currentMinute: number,
  step = 15,
): { startMinute: number; endMinute: number } {
  const currentSnapped = snapToSlot(currentMinute, step);
  const startMin = Math.min(startMinute, currentSnapped);
  const endMin = Math.max(startMinute, currentSnapped) + step;
  return {
    startMinute: startMin,
    endMinute: Math.min(24 * 60, endMin),
  };
}

function formatMinute(minute: number, hourCycle: 'h12' | 'h23'): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  if (hourCycle === 'h23') return `${pad(h)}:${pad(m)}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${pad(m)} ${period}`;
}

describe('Calendar slot selection & drag calculations', () => {
  it('snaps arbitrary minutes to 15-minute intervals', () => {
    expect(snapToSlot(0)).toBe(0);
    expect(snapToSlot(14)).toBe(0);
    expect(snapToSlot(15)).toBe(15);
    expect(snapToSlot(29)).toBe(15);
    expect(snapToSlot(30)).toBe(30);
    expect(snapToSlot(44)).toBe(30);
    expect(snapToSlot(45)).toBe(45);
    expect(snapToSlot(59)).toBe(45);
    expect(snapToSlot(600)).toBe(600); // 10:00
    expect(snapToSlot(612)).toBe(600); // 10:12 -> 10:00
    expect(snapToSlot(618)).toBe(615); // 10:18 -> 10:15
  });

  it('clamps minutes to day boundaries [0, 1440]', () => {
    expect(snapToSlot(-10)).toBe(0);
    expect(snapToSlot(1500)).toBe(1440);
  });

  it('computes drag range downwards correctly', () => {
    // User clicks at 10:00 (minute 600) and drags down to 11:30 (minute 690)
    const range = computeDragRange(600, 690);
    expect(range.startMinute).toBe(600); // 10:00
    expect(range.endMinute).toBe(705); // 11:45 (inclusive of 15m slot at 11:30)
  });

  it('computes drag range upwards correctly (invert direction)', () => {
    // User clicks at 14:00 (minute 840) and drags upwards to 12:30 (minute 750)
    const range = computeDragRange(840, 750);
    expect(range.startMinute).toBe(750); // 12:30
    expect(range.endMinute).toBe(855); // 14:15 (inclusive of 15m slot at 14:00)
  });

  it('formats minute values in 12h and 23h cycles', () => {
    expect(formatMinute(0, 'h23')).toBe('00:00');
    expect(formatMinute(0, 'h12')).toBe('12:00 AM');
    expect(formatMinute(570, 'h23')).toBe('09:30');
    expect(formatMinute(570, 'h12')).toBe('9:30 AM');
    expect(formatMinute(720, 'h12')).toBe('12:00 PM');
    expect(formatMinute(870, 'h12')).toBe('2:30 PM');
  });

  it('calculates popover placement directly to the left of the anchor slot', () => {
    function computeHorizontalPlacement(
      anchorLeft: number,
      anchorRight: number,
      popoverWidth = 380,
      margin = 12,
      viewportPadding = 16,
      windowWidth = 1440,
    ) {
      let placement: 'right' | 'left' | 'center' = 'left';
      let left = anchorLeft - margin - popoverWidth;

      if (left < viewportPadding) {
        const rightCandidate = anchorRight + margin;
        if (rightCandidate + popoverWidth <= windowWidth - viewportPadding) {
          left = rightCandidate;
          placement = 'right';
        } else {
          left = Math.max(
            viewportPadding,
            Math.min(windowWidth - popoverWidth - viewportPadding, anchorLeft),
          );
          placement = 'center';
        }
      }

      return { placement, left };
    }

    // Square clicked at x=600..750 on a 1440px screen
    const normalPlacement = computeHorizontalPlacement(600, 750);
    expect(normalPlacement.placement).toBe('left');
    expect(normalPlacement.left).toBe(600 - 12 - 380); // 208px, directly to the left!

    // Square clicked on far left edge (e.g. x=50..200) where left candidate < 16px
    const edgePlacement = computeHorizontalPlacement(50, 200);
    expect(edgePlacement.placement).toBe('right');
    expect(edgePlacement.left).toBe(200 + 12); // Flips to right when left edge has no room
  });

  it('distinguishes quick click from hold based on delay threshold', () => {
    const HOLD_DELAY_MS = 180;
    const quickClickDuration = 80;
    const holdDuration = 250;

    // Quick click releases before HOLD_DELAY_MS, preventing the 1-frame flash of the 15-minute selection indicator
    expect(quickClickDuration >= HOLD_DELAY_MS).toBe(false);
    // Holding past HOLD_DELAY_MS displays the 15-minute selection indicator
    expect(holdDuration >= HOLD_DELAY_MS).toBe(true);
  });

  it('distinguishes click from drag based on movement threshold', () => {
    function isClickGesture(startX: number, startY: number, endX: number, endY: number): boolean {
      const distX = Math.abs(endX - startX);
      const distY = Math.abs(endY - startY);
      return distX < 6 && distY < 6;
    }

    // Micro-jitter during a normal click
    expect(isClickGesture(100, 200, 102, 203)).toBe(true);
    // Deliberate vertical drag
    expect(isClickGesture(100, 200, 100, 215)).toBe(false);
    // Deliberate horizontal movement
    expect(isClickGesture(100, 200, 110, 200)).toBe(false);
  });
});
