import { describe, expect, it } from 'vitest';

import { layoutOverlappingEvents, verticalPlacement } from './layout';
import { type Interval } from '../time/interval';

const at = (hour: number, minute = 0): number => Date.UTC(2026, 7, 31, hour, minute);
const ev = (id: string, from: number, to: number) => ({
  id,
  interval: { start: at(from), end: at(to) },
});
const intervalOf = (e: { interval: Interval }): Interval => e.interval;

describe('layoutOverlappingEvents', () => {
  it('gives a lone event the full width', () => {
    const [laid] = layoutOverlappingEvents([ev('a', 9, 10)], intervalOf);
    expect(laid).toMatchObject({ left: 0, width: 1, column: 0, columnCount: 1 });
  });

  it('splits two overlapping events into two columns', () => {
    const laid = layoutOverlappingEvents([ev('a', 9, 11), ev('b', 10, 12)], intervalOf);
    expect(laid.map((l) => [l.item.id, l.column, l.columnCount])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
    ]);
    expect(laid.map((l) => l.width)).toEqual([0.5, 0.5]);
  });

  it('keeps back-to-back events full width', () => {
    const laid = layoutOverlappingEvents([ev('a', 9, 10), ev('b', 10, 11)], intervalOf);
    expect(laid.every((l) => l.width === 1)).toBe(true);
  });

  it('reuses a column when an earlier event in it has ended', () => {
    // a spans the cluster; b and c are sequential and share column 1.
    const laid = layoutOverlappingEvents(
      [ev('a', 9, 12), ev('b', 9, 10), ev('c', 10, 11)],
      intervalOf,
    );
    const byId = Object.fromEntries(laid.map((l) => [l.item.id, l]));
    expect(byId.a!.column).toBe(0);
    expect(byId.b!.column).toBe(1);
    expect(byId.c!.column).toBe(1);
    expect(laid.every((l) => l.columnCount === 2)).toBe(true);
  });

  it('lays out disjoint clusters independently', () => {
    const laid = layoutOverlappingEvents(
      [ev('a', 9, 11), ev('b', 10, 12), ev('c', 14, 15)],
      intervalOf,
    );
    const byId = Object.fromEntries(laid.map((l) => [l.item.id, l]));
    expect(byId.c!.columnCount).toBe(1);
    expect(byId.a!.columnCount).toBe(2);
  });
});

describe('layoutOverlappingEvents with an order interval', () => {
  // 'drag' was at 13:00–14:00 before the gesture; 'lunch' sits at 11:00–12:00.
  const hours = (h: number) => at(Math.floor(h), (h % 1) * 60);
  const evh = (id: string, from: number, to: number) => ({
    id,
    interval: { start: hours(from), end: hours(to) },
  });
  const lunch = evh('lunch', 11, 12);
  const orderOf = (e: { id: string; interval: Interval }): Interval =>
    e.id === 'drag' ? { start: at(13), end: at(14) } : e.interval;
  const columnsFor = (dragFrom: number, dragTo: number) =>
    Object.fromEntries(
      layoutOverlappingEvents([lunch, evh('drag', dragFrom, dragTo)], intervalOf, {
        getOrderInterval: orderOf,
      }).map((l) => [l.item.id, l.column]),
    );

  it('keeps a dragged event in the same column however far it passes its neighbour', () => {
    expect(columnsFor(11.5, 12.5)).toEqual({ lunch: 0, drag: 1 });
    expect(columnsFor(11, 12)).toEqual({ lunch: 0, drag: 1 });
    expect(columnsFor(10.5, 11.5)).toEqual({ lunch: 0, drag: 1 });
    expect(columnsFor(10, 13)).toEqual({ lunch: 0, drag: 1 });
  });

  it('still separates clusters by the real intervals', () => {
    expect(columnsFor(9, 10)).toEqual({ lunch: 0, drag: 0 });
  });

  it('orders by real start without the option, so an earlier event moves left', () => {
    const laid = layoutOverlappingEvents([lunch, evh('drag', 10.5, 11.5)], intervalOf);
    expect(Object.fromEntries(laid.map((l) => [l.item.id, l.column]))).toEqual({
      drag: 0,
      lunch: 1,
    });
  });
});

describe('verticalPlacement', () => {
  it('places an event proportionally inside the visible band', () => {
    expect(verticalPlacement({ start: at(12), end: at(18) }, at(0), at(24))).toEqual({
      top: 0.5,
      height: 0.25,
    });
  });

  it('clamps events that start before the visible band', () => {
    expect(verticalPlacement({ start: at(6), end: at(10) }, at(9), at(17))).toEqual({
      top: 0,
      height: 0.125,
    });
  });

  it('collapses events entirely outside the band to zero height', () => {
    expect(verticalPlacement({ start: at(3), end: at(5) }, at(9), at(17)).height).toBe(0);
  });
});
