import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  reflectedTimingOverrideIds,
  useCalendarTimingOverrides,
} from './useCalendarTimingOverrides';

type AuthoritativeOccurrence = Parameters<typeof reflectedTimingOverrideIds>[1][number];

function occurrence(eventId: string, start: number, end: number): AuthoritativeOccurrence {
  return { event: { id: eventId }, start, end };
}

describe('useCalendarTimingOverrides', () => {
  it('starts with an empty override map', () => {
    let timingOverrides:
      ReturnType<typeof useCalendarTimingOverrides>['timingOverrides'] | undefined;
    function Harness() {
      timingOverrides = useCalendarTimingOverrides([]).timingOverrides;
      return null;
    }

    renderToStaticMarkup(<Harness />);

    expect(timingOverrides).toBeInstanceOf(Map);
    expect(timingOverrides?.size).toBe(0);
  });
});

describe('reflectedTimingOverrideIds', () => {
  const timing = { start: 100, end: 200 };
  const overrides = new Map([['event-a', timing]]);

  it('keeps an override when its authoritative occurrence is absent or unrelated', () => {
    expect(reflectedTimingOverrideIds(overrides, [])).toEqual([]);
    expect(reflectedTimingOverrideIds(overrides, [occurrence('event-b', 100, 200)])).toEqual([]);
  });

  it('removes an override only when both authoritative times match exactly', () => {
    expect(reflectedTimingOverrideIds(overrides, [occurrence('event-a', 100, 200)])).toEqual([
      'event-a',
    ]);
    expect(reflectedTimingOverrideIds(overrides, [occurrence('event-a', 101, 200)])).toEqual([]);
    expect(reflectedTimingOverrideIds(overrides, [occurrence('event-a', 100, 201)])).toEqual([]);
  });

  it('reconciles multiple override IDs independently', () => {
    const multiple = new Map([
      ['event-a', { start: 100, end: 200 }],
      ['event-b', { start: 300, end: 400 }],
      ['event-c', { start: 500, end: 600 }],
    ]);

    expect(
      reflectedTimingOverrideIds(multiple, [
        occurrence('event-a', 100, 200),
        occurrence('event-b', 300, 401),
        occurrence('event-c', 500, 600),
      ]),
    ).toEqual(['event-a', 'event-c']);
    expect(
      reflectedTimingOverrideIds(multiple, [
        occurrence('event-a', 100, 200),
        occurrence('event-b', 300, 400),
        occurrence('event-c', 500, 600),
      ]),
    ).toEqual(['event-a', 'event-b', 'event-c']);
    expect(multiple.size).toBe(3);
  });

  it('uses the first authoritative occurrence with a matching event ID', () => {
    expect(
      reflectedTimingOverrideIds(overrides, [
        occurrence('event-a', 99, 200),
        occurrence('event-a', 100, 200),
      ]),
    ).toEqual([]);
  });
});
