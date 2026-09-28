import { describe, expect, it } from 'vitest';

import { rankEventMatches, resolveEventMove } from './event-edit.ts';

const TZ = 'America/New_York';
// Thursday 24 September 2026, 9:00 in New York.
const NOW = new Date('2026-09-24T13:00:00.000Z');

describe('rankEventMatches', () => {
  const events = [
    { id: 'vermont', title: 'Weekend in Vermont', startAt: '2026-09-25T04:00:00.000Z' },
    { id: 'partner', title: 'Partner sync', startAt: '2026-09-25T14:00:00.000Z' },
    { id: 'dentist-past', title: 'Dentist', startAt: '2026-09-01T14:00:00.000Z' },
    { id: 'dentist-next', title: 'Dentist', startAt: '2026-10-02T14:00:00.000Z' },
    { id: 'team', title: 'Team meetings review', startAt: '2026-09-28T14:00:00.000Z' },
  ];

  it('finds an event by the words people use for it', () => {
    expect(rankEventMatches(events, 'my weekend in Vermont', NOW).map((e) => e.id)).toEqual([
      'vermont',
    ]);
  });

  it('ignores case and punctuation', () => {
    expect(rankEventMatches(events, "VERMONT'S weekend!", NOW)[0]?.id).toBe('vermont');
  });

  it('matches word stems', () => {
    expect(rankEventMatches(events, 'team meeting', NOW)[0]?.id).toBe('team');
  });

  it('puts the upcoming occurrence of a repeated title first', () => {
    expect(rankEventMatches(events, 'dentist', NOW).map((e) => e.id)).toEqual([
      'dentist-next',
      'dentist-past',
    ]);
  });

  it('drops weaker matches when a full match exists', () => {
    const ids = rankEventMatches(events, 'partner sync', NOW).map((e) => e.id);
    expect(ids).toEqual(['partner']);
  });

  it('keeps a partial match when nothing matches fully', () => {
    expect(rankEventMatches(events, 'dentist cleaning', NOW).map((e) => e.id)).toContain(
      'dentist-next',
    );
  });

  it('returns nothing for unrelated words or an empty query', () => {
    expect(rankEventMatches(events, 'yoga class', NOW)).toEqual([]);
    expect(rankEventMatches(events, 'my the', NOW)).toEqual([]);
  });
});

describe('resolveEventMove', () => {
  // Weekend in Vermont: all day Friday 25 to Sunday 27 (ends Monday 00:00).
  const vermont = {
    startAt: '2026-09-25T04:00:00.000Z',
    endAt: '2026-09-28T04:00:00.000Z',
    allDay: true,
  };
  // Partner sync: Friday 25, 10:00–11:00.
  const partner = {
    startAt: '2026-09-25T14:00:00.000Z',
    endAt: '2026-09-25T15:00:00.000Z',
    allDay: false,
  };
  const saturday = { type: 'weekday', weekday: 'saturday', modifier: 'this' } as const;

  it('shifts a multi-day all-day event whole, keeping its length', () => {
    expect(
      resolveEventMove({
        event: vermont,
        newDate: saturday,
        newTime: null,
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({
      ok: true,
      startAt: '2026-09-26T04:00:00.000Z',
      endAt: '2026-09-29T04:00:00.000Z',
    });
  });

  it('keeps the wall-clock time when a timed event moves day', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: saturday,
        newTime: null,
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({
      ok: true,
      startAt: '2026-09-26T14:00:00.000Z',
      endAt: '2026-09-26T15:00:00.000Z',
    });
  });

  it('sets a new start time on the same day, keeping the length', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: null,
        newTime: { type: 'exact_time', hour: 15, minute: 30 },
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: true, startAt: '2026-09-25T19:30:00.000Z', endAt: '2026-09-25T20:30:00.000Z' });
  });

  it('sets both a new day and a new time', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: { type: 'tomorrow' },
        newTime: { type: 'exact_time', hour: 9, minute: 0 },
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: true, startAt: '2026-09-25T13:00:00.000Z', endAt: '2026-09-25T14:00:00.000Z' });
  });

  it('keeps wall-clock times across a daylight-saving change', () => {
    // 10:00 on Friday 30 October (EDT) moved to Monday 2 November (EST).
    const beforeDst = {
      startAt: '2026-10-30T14:00:00.000Z',
      endAt: '2026-10-30T15:00:00.000Z',
      allDay: false,
    };
    expect(
      resolveEventMove({
        event: beforeDst,
        newDate: { type: 'explicit_date', date: '2026-11-02' },
        newTime: null,
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: true, startAt: '2026-11-02T15:00:00.000Z', endAt: '2026-11-02T16:00:00.000Z' });
  });

  it('asks for one day when given a span', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: { type: 'relative_week', modifier: 'next', preference: 'any' },
        newTime: null,
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'needs_single_day' });
  });

  it('asks for a start time when given a vague one', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: null,
        newTime: { type: 'time_of_day', preference: 'afternoon' },
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'needs_exact_time' });
  });

  it('refuses a start time for an all-day event', () => {
    expect(
      resolveEventMove({
        event: vermont,
        newDate: saturday,
        newTime: { type: 'exact_time', hour: 9, minute: 0 },
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'all_day_has_no_time' });
  });

  it('needs a new day or time', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: null,
        newTime: { type: 'unconstrained' },
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'no_change_requested' });
  });

  it('reports a move to where the event already is', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: { type: 'weekday', weekday: 'friday', modifier: 'this' },
        newTime: null,
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'unchanged' });
  });

  it('refuses a move into the past', () => {
    expect(
      resolveEventMove({
        event: partner,
        newDate: { type: 'today' },
        newTime: { type: 'exact_time', hour: 7, minute: 0 },
        timeZone: TZ,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'in_past' });
  });
});
