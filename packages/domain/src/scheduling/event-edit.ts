import type { DateIntent, TimeIntent } from '@cal/schemas/scheduling';

import { resolveIntentDateWindow } from './intent-resolution.ts';
import {
  addZonedDays,
  getZonedParts,
  startOfZonedDay,
  toZonedDateKey,
  zonedWallClockToUtc,
} from '../time/timezone.ts';

/**
 * Moving an existing event from a sentence like "move Vermont to Saturday".
 *
 * The model only restates the request as a query and date/time intents. These
 * functions decide which events the words could mean and where the chosen one
 * lands — the same split as Find Time, where the model never produces a time.
 */

const DAY_MS = 24 * 60 * 60_000;

/** Words that carry no identity: "my", "the", "in" and so on. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'my',
  'of',
  'on',
  'our',
  'the',
  'to',
  'with',
]);

export interface MatchableEvent {
  title: string;
  startAt: string;
}

/**
 * The identifying words of an event phrase, normalised the way matching sees
 * them, so a database prefilter and the ranking can never disagree on a word.
 */
export function eventQueryWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

/** "meeting" matches "meetings"; "vermont" matches "vermont's" once punctuation is gone. */
function wordMatches(queryWord: string, titleWord: string): boolean {
  if (queryWord === titleWord) return true;
  const shorter = queryWord.length <= titleWord.length ? queryWord : titleWord;
  const longer = shorter === queryWord ? titleWord : queryWord;
  return shorter.length >= 3 && longer.startsWith(shorter);
}

/**
 * The events a phrase could mean, best first, or an empty list when none does.
 *
 * Every word of the phrase must appear in the title for a full match; a title
 * that holds only some of them is kept as a weaker match so "dentist cleaning"
 * still finds "Dentist". Ties go to the event nearest in time, upcoming ones
 * before past ones, because people mostly move what is coming up.
 */
export function rankEventMatches<T extends MatchableEvent>(
  events: readonly T[],
  query: string,
  now: Date,
): T[] {
  const queryWords = eventQueryWords(query);
  if (queryWords.length === 0) return [];
  const nowMs = now.getTime();

  const scored = events
    .map((event) => {
      const titleWords = eventQueryWords(event.title);
      const matched = queryWords.filter((word) =>
        titleWords.some((titleWord) => wordMatches(word, titleWord)),
      ).length;
      const coverage = matched / queryWords.length;
      const exact = titleWords.join(' ') === queryWords.join(' ');
      const startMs = new Date(event.startAt).getTime();
      const upcoming = startMs >= nowMs;
      return { event, coverage, exact, upcoming, distance: Math.abs(startMs - nowMs) };
    })
    .filter((entry) => entry.coverage >= 0.5);

  scored.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.coverage - a.coverage ||
      Number(b.upcoming) - Number(a.upcoming) ||
      a.distance - b.distance,
  );

  // A full match makes partial ones noise rather than alternatives.
  const best = scored[0]?.coverage ?? 0;
  return scored.filter((entry) => entry.coverage === best).map((entry) => entry.event);
}

export interface MovableEvent {
  startAt: string;
  endAt: string;
  allDay: boolean;
}

export type EventMoveFailure =
  /** Neither a new day nor a new time was given. */
  | 'no_change_requested'
  /** The new day was a span ("next week") rather than one day. */
  | 'needs_single_day'
  /** The new time was vague ("afternoon", "after 3") rather than a start time. */
  | 'needs_exact_time'
  /** A start time was given for an all-day event. */
  | 'all_day_has_no_time'
  /** The date could not exist, like February 30. */
  | 'impossible_date'
  /** The event would end before now. */
  | 'in_past'
  /** The event is already there. */
  | 'unchanged';

export type EventMoveResolution =
  { ok: true; startAt: string; endAt: string } | { ok: false; reason: EventMoveFailure };

function dayDifference(fromKey: string, toKey: string): number {
  const toUtc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / DAY_MS);
}

/**
 * Where an event lands when moved to `newDate` and/or `newTime`.
 *
 * - A new day alone shifts the whole event, keeping its length and its
 *   wall-clock times — a Friday-to-Sunday trip moved to Saturday runs Saturday
 *   to Monday.
 * - A new time sets the start and keeps the length; with no new day it stays
 *   on the day it starts on.
 * - Anything less precise than one day and one start time is sent back for
 *   clarification rather than guessed.
 */
export function resolveEventMove(input: {
  event: MovableEvent;
  newDate: DateIntent | null;
  newTime: TimeIntent | null;
  timeZone: string;
  now: Date;
}): EventMoveResolution {
  const { event, newDate, timeZone, now } = input;
  const newTime = input.newTime?.type === 'unconstrained' ? null : input.newTime;
  if (!newDate && !newTime) return { ok: false, reason: 'no_change_requested' };

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

  let targetDay = startOfZonedDay(start, timeZone);
  if (newDate) {
    const window = resolveIntentDateWindow(newDate, timeZone, now);
    if (window.isImpossibleDate) return { ok: false, reason: 'impossible_date' };
    targetDay = startOfZonedDay(window.windowStart, timeZone);
    if (addZonedDays(targetDay, 1, timeZone).getTime() < window.windowEnd.getTime()) {
      return { ok: false, reason: 'needs_single_day' };
    }
  }

  let startMs: number;
  let endMs: number;

  if (newTime) {
    if (newTime.type !== 'exact_time' && newTime.type !== 'around_time') {
      return { ok: false, reason: 'needs_exact_time' };
    }
    if (event.allDay) return { ok: false, reason: 'all_day_has_no_time' };

    const day = getZonedParts(targetDay, timeZone);
    startMs = zonedWallClockToUtc(
      {
        year: day.year,
        month: day.month,
        day: day.day,
        hour: newTime.hour,
        minute: newTime.minute,
      },
      timeZone,
    ).getTime();
    endMs = startMs + (end.getTime() - start.getTime());
  } else {
    const days = dayDifference(
      toZonedDateKey(start, timeZone),
      toZonedDateKey(targetDay, timeZone),
    );
    startMs = addZonedDays(start, days, timeZone).getTime();
    endMs = addZonedDays(end, days, timeZone).getTime();
  }

  if (startMs === start.getTime() && endMs === end.getTime()) {
    return { ok: false, reason: 'unchanged' };
  }
  if (endMs <= now.getTime()) return { ok: false, reason: 'in_past' };

  return {
    ok: true,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
  };
}
