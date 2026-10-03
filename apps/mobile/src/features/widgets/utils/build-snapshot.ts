import {
  addZonedDays,
  bucketTasks,
  compareTasks,
  formatTimeOfDay,
  isNotablePriority,
  toZonedDateKey,
} from '@cal/domain';
import type { Calendar, CalendarEvent, Task } from '@cal/schemas';

import {
  dateKeyToInstant,
  monthGridKeys,
  monthIndexOf,
  shiftDateKey,
  weekDateKeys,
} from '../../calendar/utils/window';
import {
  WIDGET_DAYS_AHEAD,
  WIDGET_MAX_DOTS_PER_CELL,
  WIDGET_MAX_EVENTS_PER_DAY,
  WIDGET_MAX_TASKS,
  WIDGET_MONTHS_AFTER,
  WIDGET_MONTHS_BEFORE,
  WIDGET_SNAPSHOT_VERSION,
  WIDGET_WEEK_COUNT,
} from '../constants';
import type {
  WidgetDay,
  WidgetEvent,
  WidgetMonth,
  WidgetSnapshot,
  WidgetTask,
  WidgetWeek,
} from '../schema';
import { widgetEventsByDay } from './event-days';
import { dayMonthLabel, monthLabel, weekRangeLabel, weekdayInitials, weekdayLabel } from './labels';

export interface WidgetSnapshotInput {
  now: Date;
  timeZone: string;
  weekStartsOn: number;
  hourCycle: 'h12' | 'h23';
  events: readonly CalendarEvent[];
  calendars: readonly Calendar[];
  hiddenCalendarIds: readonly string[];
  tasks: readonly Task[];
  fallbackColor: string;
}

/** The month indexes the widget can page between, oldest first. */
function widgetMonthIndexes(now: Date, timeZone: string): number[] {
  const current = monthIndexOf(toZonedDateKey(now, timeZone));
  const indexes: number[] = [];
  for (let offset = -WIDGET_MONTHS_BEFORE; offset <= WIDGET_MONTHS_AFTER; offset += 1) {
    indexes.push(current + offset);
  }
  return indexes;
}

/**
 * The span of events the snapshot needs: every day drawn in any of the month
 * grids. The Today list's week always falls inside it.
 */
export function widgetEventWindow(
  now: Date,
  timeZone: string,
  weekStartsOn: number,
): { start: Date; end: Date } {
  const indexes = widgetMonthIndexes(now, timeZone);
  const firstKey = monthGridKeys(indexes[0] ?? 0, timeZone, weekStartsOn)[0] ?? '';
  const lastKeys = monthGridKeys(indexes[indexes.length - 1] ?? 0, timeZone, weekStartsOn);
  const lastKey = lastKeys[lastKeys.length - 1] ?? firstKey;

  return {
    start: dateKeyToInstant(firstKey, timeZone),
    end: addZonedDays(dateKeyToInstant(lastKey, timeZone), 1, timeZone),
  };
}

function buildMonths(input: WidgetSnapshotInput, byDay: Map<string, WidgetEvent[]>): WidgetMonth[] {
  return widgetMonthIndexes(input.now, input.timeZone).map((monthIndex) => {
    const keys = monthGridKeys(monthIndex, input.timeZone, input.weekStartsOn);
    const year = Math.floor(monthIndex / 12);
    const month = String((monthIndex % 12) + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;

    const cells = keys.map((key) => {
      const events = byDay.get(key) ?? [];
      return {
        key,
        day: Number(key.slice(8, 10)),
        inMonth: key.startsWith(monthKey),
        colors: [...new Set(events.map((event) => event.color))].slice(0, WIDGET_MAX_DOTS_PER_CELL),
        count: events.length,
        chips: events.slice(0, 2).map((event) => ({ title: event.title, color: event.color })),
      };
    });

    return {
      key: monthKey,
      title: monthLabel(`${monthKey}-01`),
      year: String(year),
      weeks: Array.from({ length: 6 }, (_, week) => cells.slice(week * 7, week * 7 + 7)),
    };
  });
}

/** This week and the next, for the Week view's pager. */
function buildWeeks(input: WidgetSnapshotInput, todayKey: string): WidgetWeek[] {
  return Array.from({ length: WIDGET_WEEK_COUNT }, (_, offset) => {
    const days = weekDateKeys(todayKey, offset, input.timeZone, input.weekStartsOn);
    const first = days[0] ?? todayKey;
    return { key: first, label: weekRangeLabel(first, days[6] ?? first), days };
  });
}

/**
 * Every day any view lists in full: from the start of this week — the Week
 * view shows the days already gone — to two weeks from today, which also
 * covers all of next week.
 */
function buildDays(
  input: WidgetSnapshotInput,
  todayKey: string,
  weeks: readonly WidgetWeek[],
  byDay: Map<string, WidgetEvent[]>,
): WidgetDay[] {
  const keys = new Set(weeks.flatMap((week) => week.days));
  for (let offset = 0; offset < WIDGET_DAYS_AHEAD; offset += 1) {
    keys.add(shiftDateKey(todayKey, offset, input.timeZone));
  }

  return [...keys].sort().map((key) => ({
    key,
    weekday: weekdayLabel(key),
    dateLabel: dayMonthLabel(key),
    events: (byDay.get(key) ?? []).slice(0, WIDGET_MAX_EVENTS_PER_DAY),
  }));
}

/**
 * Today's open work — overdue first, then due today — followed by what was
 * already ticked off today, so a tick made on the Home Screen stays visible
 * instead of vanishing from under the finger.
 */
function buildTasks(input: WidgetSnapshotInput): { tasks: WidgetTask[]; moreTaskCount: number } {
  const { now, timeZone, hourCycle } = input;
  const buckets = bucketTasks(input.tasks, now, timeZone);
  const overdueIds = new Set(buckets.overdue.map((task) => task.id));

  const open = [...buckets.overdue, ...buckets.dueToday]
    .filter((task) => task.status === 'open')
    .sort(
      (a, b) => Number(overdueIds.has(b.id)) - Number(overdueIds.has(a.id)) || compareTasks(a, b),
    );

  const shownOpen = open.slice(0, WIDGET_MAX_TASKS);
  const shownDone = buckets.completedToday.slice(0, WIDGET_MAX_TASKS - shownOpen.length);

  const toWidgetTask = (task: Task): WidgetTask => ({
    id: task.id,
    title: task.title,
    completed: task.status === 'completed',
    overdue: overdueIds.has(task.id),
    flagged: isNotablePriority(task.priority),
    dueLabel:
      task.dueAt && task.hasDueTime && !overdueIds.has(task.id)
        ? formatTimeOfDay(new Date(task.dueAt), timeZone, hourCycle)
        : null,
  });

  return {
    tasks: [...shownOpen, ...shownDone].map(toWidgetTask),
    moreTaskCount: open.length - shownOpen.length,
  };
}

/** Builds the whole widget snapshot. Pure: the same input always gives the same output. */
export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const { now, timeZone } = input;
  const window = widgetEventWindow(now, timeZone, input.weekStartsOn);
  const byDay = widgetEventsByDay({ ...input, window });

  const todayKey = toZonedDateKey(now, timeZone);
  const weeks = buildWeeks(input, todayKey);

  return {
    version: WIDGET_SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    timeZone,
    hourCycle: input.hourCycle,
    weekdayLabels: weekdayInitials(input.weekStartsOn),
    months: buildMonths(input, byDay),
    weeks,
    days: buildDays(input, todayKey, weeks, byDay),
    ...buildTasks(input),
  };
}
