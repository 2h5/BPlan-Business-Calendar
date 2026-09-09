import type { TimeOfDayPreference } from '@cal/schemas/scheduling';

/**
 * Deterministic interpretation of the free-text Find Time box, e.g.
 * "15-minute meeting with Andrew".
 *
 * This is intentionally *not* a model call. Duration is the one parsed value
 * that changes which slots the availability engine produces, so it is derived
 * by code we can test rather than by an LLM. A future provider seam may refine
 * the title or preferences, but it must never widen availability.
 */
export interface SchedulingIntent {
  /** Human-facing event title, with the parsed phrases removed. */
  title: string;
  /** Null when the text gave no duration; the caller applies its own default. */
  durationMinutes: number | null;
  preferredTimeOfDay: TimeOfDayPreference;
  /** Relative day the user named, if any. Narrows the search window. */
  dayHint: 'today' | 'tomorrow' | null;
}

/** Mirrors `scheduleConstraintsSchema.durationMinutes`. */
const MIN_DURATION_MINUTES = 5;
const MAX_DURATION_MINUTES = 12 * 60;

/**
 * Openers people type before the thing itself. Stripped from the title so
 * "schedule a call with Sam" becomes "Call with Sam".
 */
const LEADING_FILLER =
  /^(?:please\s+)?(?:can\s+you\s+)?(?:find\s+time\s+for|find\s+me\s+time\s+for|schedule|book|set\s?up|put(?:\s+in)?|add|create|block(?:\s+off)?|make)\s+(?:a|an|the|some)?\s*/i;

const WORD_DURATIONS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\b(?:a\s+)?half[-\s]an[-\s]hour\b/i, 30],
  [/\b(?:a\s+)?half[-\s]hour\b/i, 30],
  [/\b(?:a\s+)?quarter[-\s]hour\b/i, 15],
  [/\b(?:an?|one)[-\s]hour(?:[-\s]long)?\b/i, 60],
  [/\bhour[-\s]long\b/i, 60],
];

const NUMERIC_MINUTES = /\b(\d+(?:\.\d+)?)\s*-?\s*(?:minutes?|mins?|m)\b/i;
const NUMERIC_HOURS = /\b(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|hrs?|hr|h)\b/i;

const TIME_OF_DAY: ReadonlyArray<readonly [RegExp, TimeOfDayPreference]> = [
  [/\b(?:this\s+|in\s+the\s+|tomorrow\s+)?morning\b/i, 'morning'],
  [/\b(?:this\s+|in\s+the\s+|tomorrow\s+)?afternoon\b/i, 'afternoon'],
  [/\b(?:this\s+|in\s+the\s+|tomorrow\s+)?(?:evening|tonight)\b/i, 'evening'],
];

const DAY_HINTS: ReadonlyArray<readonly [RegExp, 'today' | 'tomorrow']> = [
  [/\btomorrow\b/i, 'tomorrow'],
  [/\btoday\b/i, 'today'],
];

/**
 * Filler left behind once a phrase is removed, e.g. the dangling "a" in
 * "a 30 minute call" or a trailing preposition in "meeting with Andrew for".
 */
const DANGLING_ARTICLE = /^(?:a|an|the|some)\s+/i;
const DANGLING_PREPOSITION = /\s+(?:for|of|at|on|in|about|around)$/i;
/** Left behind when the duration sat between the verb and the attendee. */
const LEADING_PREPOSITION = /^(?:with|for|of|about)\s+/i;

/**
 * Parses one free-text scheduling request. Never throws: unparseable text
 * simply yields the trimmed original as the title and a null duration.
 */
export function parseSchedulingIntent(input: string): SchedulingIntent {
  let text = input.trim().replace(/\s+/g, ' ');

  const { durationMinutes, rest: afterDuration } = extractDuration(text);
  text = afterDuration;

  const { preferredTimeOfDay, rest: afterTimeOfDay } = extractTimeOfDay(text);
  text = afterTimeOfDay;

  const { dayHint, rest: afterDayHint } = extractDayHint(text);
  text = afterDayHint;

  return {
    title: cleanTitle(text) || input.trim(),
    durationMinutes,
    preferredTimeOfDay,
    dayHint,
  };
}

function extractDuration(text: string): { durationMinutes: number | null; rest: string } {
  for (const [pattern, minutes] of WORD_DURATIONS) {
    const match = pattern.exec(text);
    if (match) {
      return { durationMinutes: minutes, rest: remove(text, match) };
    }
  }

  const hours = NUMERIC_HOURS.exec(text);
  if (hours) {
    const parsed = clampDuration(Math.round(Number(hours[1]) * 60));
    if (parsed !== null) return { durationMinutes: parsed, rest: remove(text, hours) };
  }

  const minutes = NUMERIC_MINUTES.exec(text);
  if (minutes) {
    const parsed = clampDuration(Math.round(Number(minutes[1])));
    if (parsed !== null) return { durationMinutes: parsed, rest: remove(text, minutes) };
  }

  return { durationMinutes: null, rest: text };
}

function extractTimeOfDay(text: string): {
  preferredTimeOfDay: TimeOfDayPreference;
  rest: string;
} {
  for (const [pattern, preference] of TIME_OF_DAY) {
    const match = pattern.exec(text);
    if (match) {
      // "tomorrow morning" must keep the day hint for the next pass.
      const consumed = match[0];
      const rest = /^tomorrow\s/i.test(consumed)
        ? remove(text, match, 'tomorrow')
        : remove(text, match);
      return { preferredTimeOfDay: preference, rest };
    }
  }
  return { preferredTimeOfDay: 'any', rest: text };
}

function extractDayHint(text: string): { dayHint: 'today' | 'tomorrow' | null; rest: string } {
  for (const [pattern, hint] of DAY_HINTS) {
    const match = pattern.exec(text);
    if (match) return { dayHint: hint, rest: remove(text, match) };
  }
  return { dayHint: null, rest: text };
}

/** Removes a match, optionally putting a fragment back in its place. */
function remove(text: string, match: RegExpExecArray, replacement = ''): string {
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  return `${before}${replacement}${after}`.replace(/\s+/g, ' ').trim();
}

function clampDuration(minutes: number): number | null {
  if (!Number.isFinite(minutes) || minutes < MIN_DURATION_MINUTES) return null;
  return Math.min(minutes, MAX_DURATION_MINUTES);
}

function cleanTitle(text: string): string {
  const stripped = text
    .replace(LEADING_FILLER, '')
    .replace(LEADING_PREPOSITION, '')
    .replace(DANGLING_ARTICLE, '')
    .replace(DANGLING_PREPOSITION, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length === 0) return '';
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
