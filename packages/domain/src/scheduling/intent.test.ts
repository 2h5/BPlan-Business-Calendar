import { describe, expect, it } from 'vitest';

import { parseSchedulingIntent } from './intent';

describe('parseSchedulingIntent', () => {
  it('parses the canonical hyphenated request', () => {
    expect(parseSchedulingIntent('15-minute meeting with Andrew')).toEqual({
      title: 'Meeting with Andrew',
      durationMinutes: 15,
      preferredTimeOfDay: 'any',
      dayHint: null,
    });
  });

  it.each([
    ['30 min sync', 30],
    ['30-minute sync', 30],
    ['45 minutes of focus', 45],
    ['sync for 25m', 25],
    ['1 hour workshop', 60],
    ['2hr planning', 120],
    ['1.5 hour workshop', 90],
    ['half hour coffee', 30],
    ['half an hour with Sam', 30],
    ['quarter hour standup', 15],
    ['an hour with Dana', 60],
    ['hour-long review', 60],
  ])('reads the duration from %j', (input, expected) => {
    expect(parseSchedulingIntent(input).durationMinutes).toBe(expected);
  });

  it('returns a null duration when none is given', () => {
    const intent = parseSchedulingIntent('coffee with Priya');
    expect(intent.durationMinutes).toBeNull();
    expect(intent.title).toBe('Coffee with Priya');
  });

  it('does not mistake a 1:1 for a duration', () => {
    expect(parseSchedulingIntent('1:1 with Andrew')).toEqual({
      title: '1:1 with Andrew',
      durationMinutes: null,
      preferredTimeOfDay: 'any',
      dayHint: null,
    });
  });

  it('keeps a 1:1 title while still reading a stated duration', () => {
    const intent = parseSchedulingIntent('30 minute 1:1 with Andrew');
    expect(intent.durationMinutes).toBe(30);
    expect(intent.title).toBe('1:1 with Andrew');
  });

  it.each([
    ['coffee in the morning', 'morning'],
    ['review this afternoon', 'afternoon'],
    ['call this evening', 'evening'],
    ['dinner tonight', 'evening'],
  ])('reads the time of day from %j', (input, expected) => {
    expect(parseSchedulingIntent(input).preferredTimeOfDay).toBe(expected);
  });

  it('defaults the time of day to any', () => {
    expect(parseSchedulingIntent('call with Sam').preferredTimeOfDay).toBe('any');
  });

  it.each([
    ['lunch tomorrow', 'tomorrow'],
    ['standup today', 'today'],
  ])('reads the day hint from %j', (input, expected) => {
    expect(parseSchedulingIntent(input).dayHint).toBe(expected);
  });

  it('keeps both the day hint and the time of day in "tomorrow afternoon"', () => {
    expect(parseSchedulingIntent('30 min retro tomorrow afternoon')).toEqual({
      title: 'Retro',
      durationMinutes: 30,
      preferredTimeOfDay: 'afternoon',
      dayHint: 'tomorrow',
    });
  });

  it.each([
    ['schedule a call with Sam', 'Call with Sam'],
    ['book 30 minutes with the design team', 'Design team'],
    ['put a 15 minute meeting with Andrew', 'Meeting with Andrew'],
    ['find time for a retro', 'Retro'],
    ['block off deep work', 'Deep work'],
  ])('strips the leading filler in %j', (input, expected) => {
    expect(parseSchedulingIntent(input).title).toBe(expected);
  });

  it('drops a dangling preposition left by the duration', () => {
    expect(parseSchedulingIntent('meeting with Andrew for 15 minutes').title).toBe(
      'Meeting with Andrew',
    );
  });

  it('clamps an implausibly long duration to the engine maximum', () => {
    expect(parseSchedulingIntent('40 hour marathon').durationMinutes).toBe(12 * 60);
  });

  it('ignores a duration below the engine minimum', () => {
    expect(parseSchedulingIntent('2 minute check').durationMinutes).toBeNull();
  });

  it('falls back to the original text when parsing consumes everything', () => {
    expect(parseSchedulingIntent('tomorrow').title).toBe('tomorrow');
  });

  it('normalises surrounding whitespace', () => {
    expect(parseSchedulingIntent('  15-minute   meeting   with Andrew  ').title).toBe(
      'Meeting with Andrew',
    );
  });
});
