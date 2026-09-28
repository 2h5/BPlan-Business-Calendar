import {
  formatDurationText,
  generateCandidateSlots,
  parseSchedulingIntent,
  rankSlotsHeuristically,
} from '@cal/domain';
import type { ScheduleConstraints } from '@cal/schemas/scheduling';

import {
  DAY_END,
  DAY_START,
  DEMO_TODAY,
  demoInstant,
  demoMinuteOf,
  eventsOnDay,
  formatDemoDuration,
} from '../demo-data';

/** What the visitor watches being typed into Find Time. */
export const FIND_TIME_PROMPT = '30 min call with Sam tomorrow afternoon';

/** "Tomorrow" from the demo's Tuesday. */
export const FIND_TIME_DAY = DEMO_TODAY + 1;

const WORK_START = 9 * 60;
const WORK_END = 17 * 60;
/** Suggestions are spread out so the three aren't 13:00, 13:15, 13:30. */
const MIN_SPACING = 60;
const SUGGESTIONS = 3;

export interface DemoSuggestion {
  id: string;
  start: number;
  end: number;
  reason: string;
}

export interface FindTimeDemo {
  title: string;
  chips: string[];
  durationMinutes: number;
  suggestions: DemoSuggestion[];
}

/**
 * Runs the demo prompt through the same pipeline the app uses: the intent
 * parser reads the request, the availability engine produces every slot that
 * is genuinely free, and the heuristic ranker orders them. Nothing here is
 * scripted except the sample calendar.
 */
export function buildFindTimeDemo(): FindTimeDemo {
  const intent = parseSchedulingIntent(FIND_TIME_PROMPT);
  const durationMinutes = intent.durationMinutes ?? 30;
  const dayEvents = eventsOnDay(FIND_TIME_DAY);

  const constraints: ScheduleConstraints = {
    durationMinutes,
    windowStart: new Date(demoInstant(FIND_TIME_DAY, DAY_START)).toISOString(),
    windowEnd: new Date(demoInstant(FIND_TIME_DAY, DAY_END)).toISOString(),
    // Wednesday, in the engine's Sunday-first numbering.
    workingHours: [{ weekday: 3, startMinute: WORK_START, endMinute: WORK_END }],
    timezone: 'UTC',
    bufferMinutes: 0,
    granularityMinutes: 15,
    splittable: false,
    minSplitMinutes: 30,
    preferredTimeOfDay: intent.preferredTimeOfDay,
  };

  const busy = dayEvents.map((event) => ({
    start: demoInstant(FIND_TIME_DAY, event.start),
    end: demoInstant(FIND_TIME_DAY, event.end),
  }));

  const ranked = rankSlotsHeuristically(generateCandidateSlots({ constraints, busy }), constraints);

  const suggestions: DemoSuggestion[] = [];
  for (const slot of ranked) {
    const start = demoMinuteOf(slot.start);
    if (suggestions.some((picked) => Math.abs(picked.start - start) < MIN_SPACING)) continue;
    const end = start + durationMinutes;
    suggestions.push({ id: slot.id, start, end, reason: explain(start, end, dayEvents) });
    if (suggestions.length === SUGGESTIONS) break;
  }

  const chips = [formatDurationText(durationMinutes)];
  if (intent.dayHint) chips.push(capitalise(intent.dayHint));
  if (intent.preferredTimeOfDay !== 'any') chips.push(capitalise(intent.preferredTimeOfDay));

  return { title: intent.title, chips, durationMinutes, suggestions };
}

/** A plain-language reason drawn from the slot's actual neighbours. */
function explain(
  start: number,
  end: number,
  events: ReadonlyArray<{ start: number; end: number; title: string }>,
): string {
  const before = events.filter((event) => event.end <= start).at(-1);
  const after = events.find((event) => event.start >= end);
  if (before && before.end === start) return `Straight after ${before.title}`;
  if (after && after.start === end) return `Wraps up just before ${after.title}`;
  const gaps = [before ? start - before.end : null, after ? after.start - end : null].filter(
    (gap): gap is number => gap !== null,
  );
  const tightest = gaps.length > 0 ? Math.min(...gaps) : null;
  return tightest === null
    ? 'Nothing else on the calendar'
    : `At least ${formatDemoDuration(tightest)} clear on each side`;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
