import { describe, expect, it } from 'vitest';

import { describeTiming, nowLineIndex, planAgendaRows } from './agenda';

const TZ = 'America/New_York';
// 2026-09-30 in New York is UTC-4.
const at = (day: number, hhmm: string): number =>
  new Date(
    `2026-${day < 30 ? '10' : '09'}-${String(day).padStart(2, '0')}T${hhmm}:00-04:00`,
  ).getTime();

const keys = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, offset) => {
    const date = new Date(Date.UTC(2026, 8, from + offset));
    return date.toISOString().slice(0, 10);
  });

describe('planAgendaRows', () => {
  const dateKeys = keys(30, 8); // Wed 30 Sep … Wed 7 Oct
  const populated = new Set(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-06']);

  it('folds empty runs into one gap and opens new weeks with a divider', () => {
    const rows = planAgendaRows({
      dateKeys,
      isPopulated: (key) => populated.has(key),
      todayKey: '2026-09-30',
      timeZone: TZ,
      weekStartsOn: 1,
    });

    expect(rows.map((row) => row.key)).toEqual([
      'day:2026-09-30',
      'day:2026-10-01',
      'day:2026-10-02',
      'gap:2026-10-03',
      'week:2026-10-05',
      'day:2026-10-06',
      'gap:2026-10-07',
    ]);
    expect(rows[3]).toMatchObject({ fromKey: '2026-10-03', toKey: '2026-10-05' });
  });

  it('keeps today even when it is empty', () => {
    const rows = planAgendaRows({
      dateKeys: keys(30, 3),
      isPopulated: (key) => key === '2026-10-02',
      todayKey: '2026-09-30',
      timeZone: TZ,
      weekStartsOn: 0,
    });
    expect(rows.map((row) => row.key)).toEqual([
      'day:2026-09-30',
      'gap:2026-10-01',
      'day:2026-10-02',
    ]);
  });
});

describe('describeTiming', () => {
  const dayStart = at(30, '00:00');
  const dayEnd = at(1, '00:00');

  it('gives a range and length for an event inside the day', () => {
    expect(
      describeTiming(
        { start: at(30, '11:00'), end: at(30, '12:30'), allDay: false },
        dayStart,
        dayEnd,
        TZ,
        'h23',
      ),
    ).toEqual({ label: '11:00 – 12:30', minutes: 90, fillsDay: false });
  });

  it('says which end of an overnight event the day holds', () => {
    const overnight = { start: at(30, '22:00'), end: at(1, '02:00'), allDay: false };
    expect(describeTiming(overnight, dayStart, dayEnd, TZ, 'h23').label).toBe('From 22:00');
    expect(describeTiming(overnight, dayEnd, at(2, '00:00'), TZ, 'h23').label).toBe('Until 02:00');
  });

  it('treats an all-day event, or one spanning the day, as all day', () => {
    const allDay = { start: dayStart, end: dayEnd, allDay: true };
    expect(describeTiming(allDay, dayStart, dayEnd, TZ, 'h23').fillsDay).toBe(true);
    const spanning = { start: at(30, '00:00') - 1, end: at(1, '00:00') + 1, allDay: false };
    expect(describeTiming(spanning, dayStart, dayEnd, TZ, 'h23').label).toBe('All day');
  });
});

describe('nowLineIndex', () => {
  const events = [{ start: 9 }, { start: 11 }, { start: 15 }];

  it('sits before the first event still to start', () => {
    expect(nowLineIndex(events, 10)).toBe(1);
    expect(nowLineIndex(events, 11)).toBe(2);
  });

  it('sits at either end when everything is ahead or behind', () => {
    expect(nowLineIndex(events, 1)).toBe(0);
    expect(nowLineIndex(events, 20)).toBe(3);
  });
});
