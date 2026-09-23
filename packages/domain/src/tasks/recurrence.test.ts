import { describe, expect, it } from 'vitest';

import { nextTaskDue } from './recurrence';

const NY = 'America/New_York';
// Tuesday 2026-09-22, 17:00 local.
const NOW = new Date('2026-09-22T21:00:00Z');

const timed = (dueAt: string, recurrenceRule: string) => ({
  dueAt: new Date(dueAt),
  hasDueTime: true,
  recurrenceRule,
  timeZone: NY,
});

const dateOnly = (dueAt: string, recurrenceRule: string) => ({
  ...timed(dueAt, recurrenceRule),
  hasDueTime: false,
});

describe('nextTaskDue', () => {
  it('moves a daily task to the same time tomorrow', () => {
    // Due today 09:00, completed at 17:00.
    const next = nextTaskDue(timed('2026-09-22T13:00:00Z', 'FREQ=DAILY'), NOW);
    expect(next).toEqual({
      dueAt: new Date('2026-09-23T13:00:00Z'),
      recurrenceRule: 'FREQ=DAILY',
    });
  });

  it('moves past the due occurrence even when completed early', () => {
    // Due today 20:00 but completed at 17:00: the next one is tomorrow.
    const next = nextTaskDue(timed('2026-09-23T00:00:00Z', 'FREQ=DAILY'), NOW);
    expect(next?.dueAt).toEqual(new Date('2026-09-24T00:00:00Z'));
  });

  it('follows weekly weekdays', () => {
    // Monday 2026-09-21 09:00, every Monday and Thursday.
    const next = nextTaskDue(timed('2026-09-21T13:00:00Z', 'FREQ=WEEKLY;BYDAY=MO,TH'), NOW);
    expect(next?.dueAt).toEqual(new Date('2026-09-24T13:00:00Z'));
  });

  it('keeps the day of the month', () => {
    const next = nextTaskDue(timed('2026-09-15T13:00:00Z', 'FREQ=MONTHLY'), NOW);
    expect(next?.dueAt).toEqual(new Date('2026-10-15T13:00:00Z'));
  });

  it('skips occurrences missed while the task was overdue', () => {
    // Due five days ago at 09:00; the 09:00 today has also passed.
    const next = nextTaskDue(timed('2026-09-17T13:00:00Z', 'FREQ=DAILY'), NOW);
    expect(next?.dueAt).toEqual(new Date('2026-09-23T13:00:00Z'));
  });

  it('brings an overdue date-only task to today', () => {
    // Due (as a date) five days ago: today is still open.
    const next = nextTaskDue(dateOnly('2026-09-17T04:00:00Z', 'FREQ=DAILY'), NOW);
    expect(next?.dueAt).toEqual(new Date('2026-09-22T04:00:00Z'));
  });

  it('moves a date-only task due today to tomorrow, at local midnight', () => {
    const next = nextTaskDue(dateOnly('2026-09-22T04:00:00Z', 'FREQ=DAILY'), NOW);
    expect(next?.dueAt).toEqual(new Date('2026-09-23T04:00:00Z'));
  });

  it('keeps wall-clock time across the end of daylight saving time', () => {
    // Saturday 2026-10-31 09:00 EDT → Sunday 2026-11-01 09:00 EST.
    const next = nextTaskDue(
      timed('2026-10-31T13:00:00Z', 'FREQ=DAILY'),
      new Date('2026-10-31T14:00:00Z'),
    );
    expect(next?.dueAt).toEqual(new Date('2026-11-01T14:00:00Z'));
  });

  it('counts a COUNT down by the occurrences used up', () => {
    const next = nextTaskDue(timed('2026-09-22T13:00:00Z', 'FREQ=DAILY;COUNT=5'), NOW);
    expect(next?.recurrenceRule).toBe('FREQ=DAILY;COUNT=4');
  });

  it('counts skipped occurrences against COUNT too', () => {
    // Five days overdue: occurrences 0–5 are gone, 6 of 10 is next.
    const next = nextTaskDue(timed('2026-09-17T13:00:00Z', 'FREQ=DAILY;COUNT=10'), NOW);
    expect(next?.recurrenceRule).toBe('FREQ=DAILY;COUNT=4');
  });

  it('ends when COUNT is used up', () => {
    expect(nextTaskDue(timed('2026-09-22T13:00:00Z', 'FREQ=DAILY;COUNT=1'), NOW)).toBeNull();
  });

  it('ends after UNTIL', () => {
    expect(nextTaskDue(timed('2026-09-22T13:00:00Z', 'FREQ=DAILY;UNTIL=20260922'), NOW)).toBeNull();
  });

  it('does not guess at a rule it cannot read', () => {
    expect(nextTaskDue(timed('2026-09-22T13:00:00Z', 'FREQ=HOURLY'), NOW)).toBeNull();
  });
});
