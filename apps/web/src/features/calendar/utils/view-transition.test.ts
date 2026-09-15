import { describe, expect, it } from 'vitest';

import { getTransitionOrigin, getViewTransitionDirection } from './view-transition';

describe('getViewTransitionDirection', () => {
  it('returns "in" when moving deeper into the hierarchy', () => {
    expect(getViewTransitionDirection('month', 'week')).toBe('in');
    expect(getViewTransitionDirection('month', 'day')).toBe('in');
    expect(getViewTransitionDirection('week', 'day')).toBe('in');
  });

  it('returns "out" when moving up to a broader view', () => {
    expect(getViewTransitionDirection('day', 'week')).toBe('out');
    expect(getViewTransitionDirection('day', 'month')).toBe('out');
    expect(getViewTransitionDirection('week', 'month')).toBe('out');
  });

  it('returns null when fromMode and toMode are the same', () => {
    expect(getViewTransitionDirection('day', 'day')).toBeNull();
    expect(getViewTransitionDirection('week', 'week')).toBeNull();
    expect(getViewTransitionDirection('month', 'month')).toBeNull();
  });
});

describe('getTransitionOrigin', () => {
  const timeZone = 'UTC';

  it('returns default center when fromMode and toMode are identical', () => {
    const origin = getTransitionOrigin({
      fromMode: 'week',
      toMode: 'week',
      selectedDateKey: '2026-09-15',
      timeZone,
    });
    expect(origin).toEqual({ x: 50, y: 50 });
  });

  it('calculates column-anchored origin for week to day transition (Wednesday is ~50%)', () => {
    // 2026-09-16 is Wednesday (weekday 3 with weekStartsOn=0)
    // colIndex = 3 -> ((3 + 0.5) / 7) * 100 = 50.0%
    const origin = getTransitionOrigin({
      fromMode: 'week',
      toMode: 'day',
      selectedDateKey: '2026-09-16',
      timeZone,
      weekStartsOn: 0,
    });
    expect(origin).toEqual({ x: 50, y: 50 });
  });

  it('anchors to left column for Sunday with weekStartsOn=0', () => {
    // 2026-09-13 is Sunday (weekday 0)
    // colIndex = 0 -> ((0 + 0.5) / 7) * 100 = 7.14%
    const origin = getTransitionOrigin({
      fromMode: 'week',
      toMode: 'day',
      selectedDateKey: '2026-09-13',
      timeZone,
      weekStartsOn: 0,
    });
    expect(origin.x).toBe(7.14);
    expect(origin.y).toBe(50);
  });

  it('anchors to right column for Saturday with weekStartsOn=0', () => {
    // 2026-09-19 is Saturday (weekday 6)
    // colIndex = 6 -> ((6 + 0.5) / 7) * 100 = 92.86%
    const origin = getTransitionOrigin({
      fromMode: 'day',
      toMode: 'week',
      selectedDateKey: '2026-09-19',
      timeZone,
      weekStartsOn: 0,
    });
    expect(origin.x).toBe(92.86);
    expect(origin.y).toBe(50);
  });

  it('anchors both row and column for month transitions', () => {
    // September 2026:
    // Sept 1 is Tuesday (weekday 2). With weekStartsOn=0:
    // Row 0: Aug 30 - Sep 5 (daysBefore = 2)
    // Row 1: Sep 6 - Sep 12
    // Row 2: Sep 13 - Sep 19 (contains Sep 15)
    // Sep 15: gridIdx = 2 + (15 - 1) = 16 -> rowIndex = 2
    // rowIndex = 2 -> ((2 + 0.5) / 6) * 100 = 41.67%
    // colIndex = 16 % 7 = 2 -> ((2 + 0.5) / 7) * 100 = 35.71%
    const origin = getTransitionOrigin({
      fromMode: 'month',
      toMode: 'week',
      selectedDateKey: '2026-09-15',
      timeZone,
      weekStartsOn: 0,
    });
    expect(origin.x).toBe(35.71);
    expect(origin.y).toBe(41.67);
  });

  it('uses dateKeys when provided for month grid indexing', () => {
    const mockDateKeys = Array.from(
      { length: 42 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`,
    );
    // index 7 is row 1, col 0
    const origin = getTransitionOrigin({
      fromMode: 'month',
      toMode: 'day',
      selectedDateKey: '2026-09-08',
      timeZone,
      dateKeys: mockDateKeys,
    });
    expect(origin.x).toBe(7.14);
    expect(origin.y).toBe(25); // ((1 + 0.5) / 6) * 100 = 25%
  });

  it('respects weekStartsOn=1 (Monday)', () => {
    // 2026-09-14 is Monday. With weekStartsOn=1, colIndex = 0.
    const origin = getTransitionOrigin({
      fromMode: 'week',
      toMode: 'day',
      selectedDateKey: '2026-09-14',
      timeZone,
      weekStartsOn: 1,
    });
    expect(origin.x).toBe(7.14);
  });

  describe('Monday-start (weekStartsOn=1) regressions and single-day window safety', () => {
    it('anchors Wednesday Day -> Week to Wednesday column (not col 0) with weekStartsOn=1', () => {
      // 2026-09-16 is Wednesday (weekday 3).
      // With weekStartsOn=1, Monday=0, Tuesday=1, Wednesday=2.
      // Day view dateKeys has length 1 (['2026-09-16']).
      // It must NOT use index 0 as the column; it must derive colIndex = 2.
      const origin = getTransitionOrigin({
        fromMode: 'day',
        toMode: 'week',
        selectedDateKey: '2026-09-16',
        timeZone,
        weekStartsOn: 1,
        dateKeys: ['2026-09-16'],
      });
      expect(origin.x).toBe(35.71); // ((2 + 0.5) / 7) * 100 = 35.71%
      expect(origin.y).toBe(50);
    });

    it('anchors Monday Day -> Week to first column with weekStartsOn=1', () => {
      // 2026-09-14 is Monday (weekday 1).
      // With weekStartsOn=1, Monday is column 0.
      const origin = getTransitionOrigin({
        fromMode: 'day',
        toMode: 'week',
        selectedDateKey: '2026-09-14',
        timeZone,
        weekStartsOn: 1,
        dateKeys: ['2026-09-14'],
      });
      expect(origin.x).toBe(7.14); // ((0 + 0.5) / 7) * 100 = 7.14%
      expect(origin.y).toBe(50);
    });

    it('computes correct month row and column for Week -> Month using weekStartsOn=1', () => {
      // Sep 2026 with weekStartsOn=1:
      // Sep 1 is Tuesday. daysBefore = (2 - 1 + 7) % 7 = 1 (Aug 31 is Monday).
      // Sep 16: gridIdx = 1 + (16 - 1) = 16 -> rowIndex = Math.floor(16 / 7) = 2.
      // rowIndex 2 -> ((2 + 0.5) / 6) * 100 = 41.67%.
      // colIndex = (3 - 1 + 7) % 7 = 2 -> ((2 + 0.5) / 7) * 100 = 35.71%.
      const weekDateKeys = [
        '2026-09-14',
        '2026-09-15',
        '2026-09-16',
        '2026-09-17',
        '2026-09-18',
        '2026-09-19',
        '2026-09-20',
      ];
      const origin = getTransitionOrigin({
        fromMode: 'week',
        toMode: 'month',
        selectedDateKey: '2026-09-16',
        timeZone,
        weekStartsOn: 1,
        dateKeys: weekDateKeys,
      });
      expect(origin.x).toBe(35.71);
      expect(origin.y).toBe(41.67);
    });

    it('computes correct column and row for Day -> Month using weekStartsOn=1', () => {
      // 2026-09-16 with Day view 1-day dateKeys.
      // Must not use index 0 as column or row; must calculate relative to weekStartsOn=1.
      const origin = getTransitionOrigin({
        fromMode: 'day',
        toMode: 'month',
        selectedDateKey: '2026-09-16',
        timeZone,
        weekStartsOn: 1,
        dateKeys: ['2026-09-16'],
      });
      expect(origin.x).toBe(35.71);
      expect(origin.y).toBe(41.67);
    });

    it('preserves existing Sunday-start (weekStartsOn=0) behavior with 1-day dateKeys', () => {
      // 2026-09-16 Wednesday with weekStartsOn=0:
      // Wednesday is column 3 (Sun=0, Mon=1, Tue=2, Wed=3).
      // ((3 + 0.5) / 7) * 100 = 50.0%
      const dayToWeek = getTransitionOrigin({
        fromMode: 'day',
        toMode: 'week',
        selectedDateKey: '2026-09-16',
        timeZone,
        weekStartsOn: 0,
        dateKeys: ['2026-09-16'],
      });
      expect(dayToWeek).toEqual({ x: 50, y: 50 });

      // Day -> Month with weekStartsOn=0:
      // Sep 1 is Tuesday (daysBefore = 2).
      // Sep 16: gridIdx = 2 + (16 - 1) = 17 -> rowIndex = 2 (41.67%), colIndex = 3 (50.0%).
      const dayToMonth = getTransitionOrigin({
        fromMode: 'day',
        toMode: 'month',
        selectedDateKey: '2026-09-16',
        timeZone,
        weekStartsOn: 0,
        dateKeys: ['2026-09-16'],
      });
      expect(dayToMonth).toEqual({ x: 50, y: 41.67 });
    });
  });
});
