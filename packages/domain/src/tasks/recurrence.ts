import { expandOccurrences } from '../recurrence/expand';
import { formatRRule, parseRRule } from '../recurrence/rrule';
import { startOfZonedDay } from '../time/timezone';

/** How far ahead to look for the next occurrence before giving up. */
const LOOKAHEAD_MS = 5 * 366 * 86_400_000;

export interface RecurringTaskDue {
  /** The due instant of the occurrence being completed. */
  dueAt: Date;
  /** False when the task is due on a date rather than at a time. */
  hasDueTime: boolean;
  /** RFC 5545 RRULE body, e.g. `FREQ=WEEKLY;BYDAY=MO`. */
  recurrenceRule: string;
  /** The zone the due date's wall-clock time is anchored to. */
  timeZone: string;
}

export interface NextTaskDue {
  dueAt: Date;
  /**
   * The rule to store with the moved task. It differs from the input only when
   * the rule has a COUNT, which is reduced by the occurrences used up so the
   * series still ends where it would have.
   */
  recurrenceRule: string;
}

/**
 * Where a repeating task moves when it is completed, or null when its series
 * has ended (COUNT or UNTIL used up) or its rule cannot be read — in which
 * case completing it simply completes it.
 *
 * The task is moved rather than copied, so its due date is the series anchor:
 * the next due date is generated from it, keeping wall-clock time across DST.
 *
 * Missed occurrences are skipped rather than queued. The next due date is the
 * first occurrence after both the one being completed and the present:
 * - a timed task lands on its next time still to come;
 * - a date-only task lands on today at the earliest, since a date-only task
 *   due today is still current until the day is over.
 */
export function nextTaskDue(task: RecurringTaskDue, now: Date): NextTaskDue | null {
  const rule = parseRRule(task.recurrenceRule);
  if (!rule) return null;

  const present = task.hasDueTime ? now : startOfZonedDay(now, task.timeZone);
  const floor = Math.max(task.dueAt.getTime() + 1, present.getTime());

  // A zero-length occurrence overlaps the window only when it starts after
  // the window's start, so starting one millisecond early includes `floor`.
  const [next] = expandOccurrences(
    {
      start: task.dueAt,
      end: task.dueAt,
      timeZone: task.timeZone,
      recurrenceRule: task.recurrenceRule,
    },
    { start: new Date(floor - 1), end: new Date(floor + LOOKAHEAD_MS) },
    { limit: 1 },
  );
  if (!next) return null;

  const recurrenceRule =
    rule.count === undefined
      ? task.recurrenceRule
      : formatRRule({ ...rule, count: rule.count - next.index });

  return { dueAt: new Date(next.start), recurrenceRule };
}
