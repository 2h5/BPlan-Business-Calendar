import { describe, expect, it } from 'vitest';

import { buildDayBar, formatHourMark, type DayBarInput } from './day-bar';

const TZ = 'America/New_York';
// 2026-09-23 in New York is UTC-4.
const at = (hhmm: string): number => new Date(`2026-09-23T${hhmm}:00-04:00`).getTime();

function input(overrides: Partial<DayBarInput> = {}): DayBarInput {
  return {
    dayStart: new Date(at('00:00')),
    dayEnd: new Date(new Date('2026-09-24T00:00:00-04:00').getTime()),
    now: new Date(at('08:12')),
    timeZone: TZ,
    workdayStartsAt: at('09:00'),
    workdayEndsAt: at('17:00'),
    busy: [],
    free: [],
    ...overrides,
  };
}

describe('buildDayBar', () => {
  it('spans the working day on whole hours', () => {
    const bar = buildDayBar(input());
    expect(bar?.startMinute).toBe(9 * 60);
    expect(bar?.endMinute).toBe(17 * 60);
    expect(bar?.labels.map((label) => label.minute)).toEqual([9 * 60, 12 * 60, 15 * 60, 17 * 60]);
    expect(bar?.labels[1]?.percent).toBe(37.5);
  });

  it('widens to take in an event outside working hours', () => {
    const bar = buildDayBar(
      input({
        busy: [{ key: 'dentist', start: at('18:00'), end: at('19:00'), color: '#6E8BFF' }],
      }),
    );
    expect(bar?.startMinute).toBe(9 * 60);
    expect(bar?.endMinute).toBe(19 * 60);
    expect(bar?.segments).toEqual([
      { key: 'dentist', kind: 'busy', left: 90, width: 10, color: '#6E8BFF' },
    ]);
  });

  it('positions free time under busy time as percentages', () => {
    const bar = buildDayBar(
      input({
        busy: [{ key: 'standup', start: at('09:00'), end: at('10:00'), color: '#3ECF8E' }],
        free: [{ start: at('10:00'), end: at('13:00') }],
      }),
    );
    expect(bar?.segments.map((segment) => [segment.kind, segment.left, segment.width])).toEqual([
      ['free', 12.5, 37.5],
      ['busy', 0, 12.5],
    ]);
  });

  it('marks events that have already ended as past', () => {
    const bar = buildDayBar(
      input({
        now: new Date(at('12:00')),
        busy: [
          { key: 'done', start: at('09:00'), end: at('10:00'), color: '#3ECF8E' },
          { key: 'ahead', start: at('14:00'), end: at('15:00'), color: '#3ECF8E' },
        ],
      }),
    );
    expect(bar?.segments.map((segment) => [segment.key, segment.past ?? false])).toEqual([
      ['done', true],
      ['ahead', false],
    ]);
  });

  it('clamps the now tick to the bar', () => {
    expect(buildDayBar(input({ now: new Date(at('07:00')) }))?.nowPercent).toBe(0);
    expect(buildDayBar(input({ now: new Date(at('13:00')) }))?.nowPercent).toBe(50);
    expect(buildDayBar(input({ now: new Date(at('22:00')) }))?.nowPercent).toBe(100);
  });

  it('draws nothing on a day off with no timed events', () => {
    expect(buildDayBar(input({ workdayStartsAt: null, workdayEndsAt: null }))).toBeNull();
  });

  it('still draws a day off that has events', () => {
    const bar = buildDayBar(
      input({
        workdayStartsAt: null,
        workdayEndsAt: null,
        busy: [{ key: 'brunch', start: at('11:30'), end: at('12:15'), color: '#FF8FB1' }],
      }),
    );
    expect(bar?.startMinute).toBe(11 * 60);
    expect(bar?.endMinute).toBe(13 * 60);
  });
});

describe('formatHourMark', () => {
  it('follows the clock preference', () => {
    expect(formatHourMark(8 * 60, 'h12')).toBe('8a');
    expect(formatHourMark(12 * 60, 'h12')).toBe('12p');
    expect(formatHourMark(0, 'h12')).toBe('12a');
    expect(formatHourMark(19 * 60, 'h23')).toBe('19');
  });
});
