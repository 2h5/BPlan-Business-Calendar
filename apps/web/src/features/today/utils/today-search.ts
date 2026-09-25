import {
  calendarDaysBetween,
  describeTaskDue,
  formatDuration,
  formatTimeOfDay,
  isNotablePriority,
  PRIORITY_LABELS,
  toZonedDateKey,
  type DueTone,
} from '@cal/domain';
import type { Calendar, CalendarEvent, HourCycle, TaskList } from '@cal/schemas';

import type { SearchResults } from '../../search/api/search.api';

export type TodaySearchKind = 'event' | 'task' | 'calendar' | 'list';
export type TodaySearchTone = 'accent' | 'warning' | 'danger' | 'success' | 'neutral';

export interface TodaySearchBadge {
  label: string;
  tone: TodaySearchTone;
}

export interface TodaySearchItem {
  key: string;
  kind: TodaySearchKind;
  title: string;
  href: string;
  /** Calendar or list colour, used for the row's swatch. */
  color: string | null;
  /** The most useful fact: when an event happens, when a task is due. */
  primary: string;
  primaryTone: TodaySearchTone;
  /** Supporting facts such as location, calendar, list, or estimate. */
  details: string[];
  /** An excerpt of the notes when the match is not in the title. */
  snippet: string | null;
  badges: TodaySearchBadge[];
  /** Completed tasks and past events read as secondary. */
  isMuted: boolean;
}

export interface TodaySearchSection {
  kind: TodaySearchKind;
  title: string;
  /** Matches returned by the server, which may exceed the rows shown. */
  total: number;
  items: TodaySearchItem[];
}

export interface TodaySearchContext {
  query: string;
  now: Date;
  timeZone: string;
  hourCycle: HourCycle;
  calendars: readonly Calendar[];
  lists: readonly TaskList[];
}

const SECTION_LIMITS: Record<TodaySearchKind, number> = {
  event: 4,
  task: 4,
  calendar: 2,
  list: 2,
};

const DUE_TONES: Record<DueTone, TodaySearchTone> = {
  overdue: 'danger',
  today: 'warning',
  soon: 'accent',
  later: 'neutral',
  none: 'neutral',
};

const SOURCE_LABELS: Record<Calendar['sourceType'], string> = {
  internal: 'BPlan calendar',
  google: 'Google calendar',
  microsoft: 'Outlook calendar',
  device: 'Device calendar',
};

export function buildTodaySearchSections(
  data: SearchResults,
  context: TodaySearchContext,
): TodaySearchSection[] {
  const calendarsById = new Map(context.calendars.map((calendar) => [calendar.id, calendar]));
  const listsById = new Map(context.lists.map((list) => [list.id, list]));

  const sections: TodaySearchSection[] = [
    {
      kind: 'event',
      title: 'Events',
      total: data.events.length,
      items: sortEventsForSearch(data.events, context.now)
        .slice(0, SECTION_LIMITS.event)
        .map((event) => describeEvent(event, calendarsById.get(event.calendarId), context)),
    },
    {
      kind: 'task',
      title: 'Tasks',
      total: data.tasks.length,
      items: [...data.tasks]
        .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
        .slice(0, SECTION_LIMITS.task)
        .map((task) => {
          const list = task.listId ? listsById.get(task.listId) : undefined;
          const isCompleted = task.status === 'completed';
          const due = describeTaskDue(task, context);
          const badges: TodaySearchBadge[] = [];
          if (isCompleted) badges.push({ label: 'Done', tone: 'success' });
          else if (task.status === 'scheduled') badges.push({ label: 'Scheduled', tone: 'accent' });
          if (!isCompleted && isNotablePriority(task.priority)) {
            badges.push({
              label: PRIORITY_LABELS[task.priority],
              tone: task.priority === 'urgent' ? 'danger' : 'warning',
            });
          }

          return {
            key: `task:${task.id}`,
            kind: 'task' as const,
            title: task.title,
            href: `/tasks?task=${task.id}`,
            color: list?.color ?? null,
            primary: isCompleted ? 'Completed' : describeDuePrimary(due.text),
            primaryTone: isCompleted ? 'neutral' : DUE_TONES[due.tone],
            details: [
              list?.name ?? 'Inbox',
              ...(task.estimatedMinutes ? [formatDuration(task.estimatedMinutes)] : []),
              ...(task.recurrenceRule ? ['Repeats'] : []),
            ],
            snippet: matchSnippet(task.title, task.description, context.query),
            badges,
            isMuted: isCompleted,
          };
        }),
    },
    {
      kind: 'calendar',
      title: 'Calendars',
      total: data.calendars.length,
      items: data.calendars.slice(0, SECTION_LIMITS.calendar).map((calendar) => ({
        key: `calendar:${calendar.id}`,
        kind: 'calendar' as const,
        title: calendar.name,
        href: '/calendar',
        color: calendar.color,
        primary: SOURCE_LABELS[calendar.sourceType],
        primaryTone: 'neutral' as const,
        details: [
          ...(calendar.isDefault ? ['Default'] : []),
          ...(calendar.isReadOnly ? ['Read-only'] : []),
        ],
        snippet: null,
        badges: calendar.isVisible ? [] : [{ label: 'Hidden', tone: 'neutral' as const }],
        isMuted: !calendar.isVisible,
      })),
    },
    {
      kind: 'list',
      title: 'Lists',
      total: data.lists.length,
      items: data.lists.slice(0, SECTION_LIMITS.list).map((list) => ({
        key: `list:${list.id}`,
        kind: 'list' as const,
        title: list.name,
        href: `/tasks?list=${list.id}`,
        color: list.color,
        primary: 'Task list',
        primaryTone: 'neutral' as const,
        details: [],
        snippet: null,
        badges: [],
        isMuted: false,
      })),
    },
  ];

  return sections.filter((section) => section.items.length > 0);
}

/** Ongoing and upcoming events first (soonest first), then the most recent past ones. */
export function sortEventsForSearch(events: readonly CalendarEvent[], now: Date): CalendarEvent[] {
  const nowMs = now.getTime();
  const upcoming = events
    .filter((event) => new Date(event.endAt).getTime() >= nowMs)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const past = events
    .filter((event) => new Date(event.endAt).getTime() < nowMs)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  return [...upcoming, ...past];
}

function describeEvent(
  event: CalendarEvent,
  calendar: Calendar | undefined,
  context: TodaySearchContext,
): TodaySearchItem {
  const { now, timeZone, hourCycle } = context;
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const isPast = end.getTime() < now.getTime();
  const isNow = !isPast && start.getTime() <= now.getTime();
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const time = event.allDay
    ? 'All day'
    : `${formatTimeOfDay(start, timeZone, hourCycle)} – ${formatTimeOfDay(end, timeZone, hourCycle)}`;

  const badges: TodaySearchBadge[] = [];
  if (isNow) badges.push({ label: 'Now', tone: 'accent' });
  if (event.status === 'tentative') badges.push({ label: 'Tentative', tone: 'warning' });

  return {
    key: `event:${event.id}`,
    kind: 'event',
    title: event.title,
    href: `/calendar?date=${toZonedDateKey(start, timeZone)}&event=${event.id}`,
    color: event.color ?? calendar?.color ?? null,
    primary: `${relativeDayLabel(start, now, timeZone)} · ${time}`,
    primaryTone: isNow ? 'accent' : 'neutral',
    details: [
      ...(!event.allDay && minutes > 0 ? [formatDuration(minutes)] : []),
      ...(event.location ? [event.location] : []),
      ...(calendar ? [calendar.name] : []),
      ...(event.recurrenceRule || event.recurringEventId ? ['Repeats'] : []),
    ],
    snippet: matchSnippet(event.title, event.description, context.query),
    badges,
    isMuted: isPast,
  };
}

/** "Today", "Tomorrow", "Yesterday", or "Wed, Sep 24" (with the year when it differs). */
export function relativeDayLabel(instant: Date, now: Date, timeZone: string): string {
  const days = calendarDaysBetween(now, instant, timeZone);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';

  const sameYear =
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(instant) ===
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(now);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone,
  }).format(instant);
}

/**
 * A short excerpt of `notes` around the first match, shown only when the title
 * itself does not explain why the row matched.
 */
export function matchSnippet(
  title: string,
  notes: string | null,
  query: string,
  radius = 48,
): string | null {
  const needle = query.trim().toLowerCase();
  if (!notes || !needle || title.toLowerCase().includes(needle)) return null;

  const text = notes.replace(/\s+/g, ' ').trim();
  const index = text.toLowerCase().indexOf(needle);
  if (index === -1) return null;

  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export interface HighlightSegment {
  text: string;
  isMatch: boolean;
}

/** Splits `text` into plain and matching runs for case-insensitive highlighting. */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [{ text, isMatch: false }];

  const segments: HighlightSegment[] = [];
  const haystack = text.toLowerCase();
  let cursor = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    if (index > cursor) segments.push({ text: text.slice(cursor, index), isMatch: false });
    segments.push({ text: text.slice(index, index + needle.length), isMatch: true });
    cursor = index + needle.length;
    index = haystack.indexOf(needle, cursor);
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), isMatch: false });
  return segments;
}

function describeDuePrimary(text: string): string {
  if (!text) return 'No due date';
  if (text.endsWith('overdue')) return text;
  // Keep "Fri 12 Sep" capitalised; only soften the relative words.
  const softened = /^(Today|Tomorrow|Yesterday)\b/.test(text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
  return `Due ${softened}`;
}
