import type { OccasionIntent, TimeIntent } from '@cal/schemas/scheduling';

/**
 * Semantic time policy.
 *
 * The model may *name* a part of the day ("dinner", "tomorrow morning"), but
 * only this file decides which local times that name allows. The resulting
 * window is a hard bound on candidate generation, applied before ranking, so
 * the ranker never sees a 2 PM "dinner" slot it could rationalize.
 *
 * Every window is `[earliestMinute, latestMinute]` in local minutes of day,
 * with the same meaning as the availability engine: a block may not start
 * before `earliestMinute` and may not end after `latestMinute`. Windows are
 * deliberately broad; they exclude what is plainly wrong, not what is merely
 * unusual.
 */
export interface LocalMinuteWindow {
  earliestMinute: number;
  latestMinute: number;
}

export const OCCASION_WINDOWS: Readonly<Record<OccasionIntent, LocalMinuteWindow>> = {
  breakfast: { earliestMinute: 7 * 60, latestMinute: 10 * 60 + 30 },
  brunch: { earliestMinute: 10 * 60, latestMinute: 14 * 60 },
  lunch: { earliestMinute: 11 * 60 + 30, latestMinute: 14 * 60 },
  dinner: { earliestMinute: 17 * 60, latestMinute: 21 * 60 + 30 },
  drinks: { earliestMinute: 16 * 60, latestMinute: 23 * 60 },
};

export type TimeOfDayName = 'morning' | 'afternoon' | 'evening';

/** Also the bands the heuristic ranker prefers within, so both agree. */
export const TIME_OF_DAY_WINDOWS: Readonly<Record<TimeOfDayName, LocalMinuteWindow>> = {
  morning: { earliestMinute: 5 * 60, latestMinute: 12 * 60 },
  afternoon: { earliestMinute: 12 * 60, latestMinute: 17 * 60 },
  evening: { earliestMinute: 17 * 60, latestMinute: 22 * 60 },
};

export const OCCASION_LABELS: Readonly<Record<OccasionIntent, string>> = {
  breakfast: 'Breakfast',
  brunch: 'Brunch',
  lunch: 'Lunch',
  dinner: 'Dinner',
  drinks: 'Drinks',
};

export type SemanticTimeWindow =
  /** Nothing semantic to enforce, or an explicit clock time governs instead. */
  | { kind: 'none' }
  | ({ kind: 'window'; label: string } & LocalMinuteWindow)
  /** Two named parts of the day that cannot both hold ("breakfast this evening"). */
  | { kind: 'contradictory'; label: string };

/**
 * Resolves the hard local-time window implied by named parts of the day.
 *
 * Precedence:
 * - An explicit clock bound (exact, after, before, between) always wins and
 *   the semantic cue is ignored: "dinner at 3 PM" means 3 PM.
 * - "around <time>" is a soft clock preference. When that time sits inside the
 *   occasion's window the window applies ("dinner around 7"); when it does
 *   not, the explicit time wins and no window is imposed ("lunch around 4").
 * - A named time of day and an occasion intersect ("drinks tonight").
 */
export function resolveSemanticTimeWindow(
  time: TimeIntent,
  occasion: OccasionIntent | null | undefined,
): SemanticTimeWindow {
  const occasionWindow = occasion ? OCCASION_WINDOWS[occasion] : null;
  const occasionLabel = occasion ? OCCASION_LABELS[occasion] : null;

  switch (time.type) {
    case 'exact_time':
    case 'after_time':
    case 'before_time':
    case 'between_times':
      return { kind: 'none' };

    case 'around_time': {
      if (!occasionWindow || !occasionLabel) return { kind: 'none' };
      const minute = time.hour * 60 + time.minute;
      const inside =
        minute >= occasionWindow.earliestMinute && minute < occasionWindow.latestMinute;
      return inside
        ? { kind: 'window', label: occasionLabel, ...occasionWindow }
        : { kind: 'none' };
    }

    case 'time_of_day': {
      const partWindow = TIME_OF_DAY_WINDOWS[time.preference];
      const partLabel = capitalize(time.preference);
      if (!occasionWindow || !occasionLabel) {
        return { kind: 'window', label: partLabel, ...partWindow };
      }
      const label = `${occasionLabel} (${time.preference})`;
      const intersection = intersectWindows(partWindow, occasionWindow);
      return intersection
        ? { kind: 'window', label, ...intersection }
        : { kind: 'contradictory', label };
    }

    case 'unconstrained':
      return occasionWindow && occasionLabel
        ? { kind: 'window', label: occasionLabel, ...occasionWindow }
        : { kind: 'none' };
  }
}

export function intersectWindows(
  left: LocalMinuteWindow,
  right: LocalMinuteWindow,
): LocalMinuteWindow | null {
  const earliestMinute = Math.max(left.earliestMinute, right.earliestMinute);
  const latestMinute = Math.min(left.latestMinute, right.latestMinute);
  return latestMinute > earliestMinute ? { earliestMinute, latestMinute } : null;
}

/** "Dinner usually falls between 5:00 PM and 9:30 PM, outside your scheduling hours…" */
export function semanticWindowOutsideHoursQuestion(
  window: { label: string } & LocalMinuteWindow,
): string {
  return (
    `${window.label} usually falls between ${formatLocalMinute(window.earliestMinute)} and ` +
    `${formatLocalMinute(window.latestMinute)}, which is outside your scheduling hours. ` +
    'Name a specific day and time, or adjust your scheduling hours.'
  );
}

export function semanticWindowContradictionQuestion(label: string): string {
  return `${label} doesn't fit that part of the day. What time would you like?`;
}

export function formatClockTime(hour: number, minute: number): string {
  const period = hour >= 12 && hour < 24 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

function formatLocalMinute(minuteOfDay: number): string {
  return formatClockTime(Math.floor(minuteOfDay / 60), minuteOfDay % 60);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
