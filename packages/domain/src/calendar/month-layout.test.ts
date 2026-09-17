import { describe, expect, it } from 'vitest';

import { layoutMonthWeek, type MonthSpan } from './month-layout';

const span = (startColumn: number, endColumn: number): MonthSpan => ({ startColumn, endColumn });

/** Items are plain spans here; the layout is generic over what it carries. */
const layout = (spans: MonthSpan[], maxLanes?: number) =>
  layoutMonthWeek(spans, (item) => item, maxLanes === undefined ? {} : { maxLanes });

describe('layoutMonthWeek', () => {
  it('keeps a multi-day event as one segment rather than one per day', () => {
    const { segments } = layout([span(1, 4)]);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startColumn: 1, endColumn: 4, lane: 0 });
  });

  it('shares a lane between events whose spans do not touch', () => {
    const { segments, laneCount } = layout([span(0, 1), span(3, 4)]);

    expect(segments.map((segment) => segment.lane)).toEqual([0, 0]);
    expect(laneCount).toBe(1);
  });

  it('pushes an overlapping event to the next lane', () => {
    const { segments, laneCount } = layout([span(0, 3), span(2, 5)]);

    expect(segments.map((segment) => segment.lane)).toEqual([0, 1]);
    expect(laneCount).toBe(2);
  });

  it('treats adjacent spans as overlapping so bars never abut mid-lane', () => {
    const { laneCount } = layout([span(0, 2), span(3, 4)]);

    // Column 3 starts exactly where column 2 ended, so the lane is free again.
    expect(laneCount).toBe(1);
  });

  it('gives the longer run the top lane', () => {
    const { segments } = layout([span(0, 0), span(0, 6)]);

    const longest = segments.find((segment) => segment.endColumn === 6);
    expect(longest?.lane).toBe(0);
  });

  it('clamps a span that runs past the row and flags both edges', () => {
    const { segments } = layout([span(-3, 9)]);

    expect(segments[0]).toMatchObject({
      startColumn: 0,
      endColumn: 6,
      continuesBefore: true,
      continuesAfter: true,
    });
  });

  it('does not flag edges for an event contained by the row', () => {
    const { segments } = layout([span(2, 3)]);

    expect(segments[0]).toMatchObject({ continuesBefore: false, continuesAfter: false });
  });

  it('drops an item that ends before the row starts', () => {
    const { segments, laneCount } = layout([span(-5, -1)]);

    expect(segments).toEqual([]);
    expect(laneCount).toBe(0);
  });

  it('drops an item that begins after the row ends', () => {
    expect(layout([span(7, 9)]).segments).toEqual([]);
  });

  it('counts what did not fit against each column it covers', () => {
    const { segments, overflowByColumn } = layout([span(0, 6), span(0, 6), span(1, 2)], 2);

    expect(segments).toHaveLength(2);
    expect(overflowByColumn).toEqual([0, 1, 1, 0, 0, 0, 0]);
  });

  it('reports no lanes for an empty week', () => {
    expect(layout([])).toEqual({
      segments: [],
      laneCount: 0,
      overflowByColumn: [0, 0, 0, 0, 0, 0, 0],
    });
  });
});
