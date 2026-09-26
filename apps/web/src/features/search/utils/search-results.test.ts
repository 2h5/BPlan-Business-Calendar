import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  buildSearchSections,
  matchSnippet,
  relativeDayLabel,
  sortEventsForSearch,
  splitHighlight,
} from './search-results';
import type { TaskWithTags } from '../../tasks/api/tasks.api';

const TZ = 'America/New_York';
const NOW = new Date('2026-09-23T12:00:00-04:00');
const USER = '11111111-1111-1111-1111-111111111111';
const CALENDAR_ID = '22222222-2222-2222-2222-222222222222';

const calendar: Calendar = {
  id: CALENDAR_ID,
  userId: USER,
  name: 'Work',
  color: '#3366ff',
  sourceType: 'google',
  providerAccountId: null,
  providerCalendarId: null,
  isVisible: true,
  isDefault: false,
  isReadOnly: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function event(id: string, start: string, end: string, overrides: Partial<CalendarEvent> = {}) {
  return {
    id,
    userId: USER,
    calendarId: CALENDAR_ID,
    title: `Event ${id}`,
    description: null,
    location: null,
    color: null,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    allDay: false,
    timezone: TZ,
    status: 'confirmed',
    recurrenceRule: null,
    alerts: [],
    sourceType: 'internal',
    providerEventId: null,
    recurringEventId: null,
    recurrenceOriginalStartAt: null,
    providerEtag: null,
    providerUpdatedAt: null,
    syncStatus: 'synced',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } satisfies CalendarEvent;
}

function task(overrides: Partial<TaskWithTags>): TaskWithTags {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    userId: USER,
    listId: null,
    title: 'Write report',
    description: null,
    status: 'open',
    priority: 'normal',
    dueAt: null,
    hasDueTime: false,
    estimatedMinutes: null,
    scheduledEventId: null,
    isFlexible: true,
    recurrenceRule: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tagIds: [],
    ...overrides,
  };
}

const context = {
  query: 'report',
  now: NOW,
  timeZone: TZ,
  hourCycle: 'h12' as const,
  calendars: [calendar],
  lists: [],
};

describe('sortEventsForSearch', () => {
  it('puts ongoing and upcoming events first, soonest first, then recent past events', () => {
    const sorted = sortEventsForSearch(
      [
        event('past-old', '2026-09-01T09:00:00-04:00', '2026-09-01T10:00:00-04:00'),
        event('later', '2026-09-30T09:00:00-04:00', '2026-09-30T10:00:00-04:00'),
        event('past-recent', '2026-09-22T09:00:00-04:00', '2026-09-22T10:00:00-04:00'),
        event('now', '2026-09-23T11:30:00-04:00', '2026-09-23T12:30:00-04:00'),
      ],
      NOW,
    );
    expect(sorted.map((item) => item.id)).toEqual(['now', 'later', 'past-recent', 'past-old']);
  });
});

describe('buildSearchSections', () => {
  it('describes an event with its day, time range, duration, location, and calendar', () => {
    const [section] = buildSearchSections(
      {
        events: [
          event('e1', '2026-09-24T14:00:00-04:00', '2026-09-24T15:30:00-04:00', {
            location: 'Room 4',
          }),
        ],
        tasks: [],
        calendars: [],
        lists: [],
      },
      context,
    );
    const item = section?.items[0];
    expect(item?.primary).toBe('Tomorrow · 2:00 PM – 3:30 PM');
    expect(item?.details).toEqual(['1h 30m', 'Room 4', 'Work']);
    expect(item?.color).toBe('#3366ff');
    expect(item?.isMuted).toBe(false);
  });

  it('flags an in-progress event as Now', () => {
    const [section] = buildSearchSections(
      {
        events: [event('e1', '2026-09-23T11:30:00-04:00', '2026-09-23T12:30:00-04:00')],
        tasks: [],
        calendars: [],
        lists: [],
      },
      context,
    );
    expect(section?.items[0]?.badges).toEqual([{ label: 'Now', tone: 'accent' }]);
  });

  it('describes overdue, urgent tasks and orders completed tasks last', () => {
    const [section] = buildSearchSections(
      {
        events: [],
        tasks: [
          task({ id: 'done', status: 'completed', title: 'Done report' }),
          task({
            id: 'late',
            priority: 'urgent',
            dueAt: '2026-09-20T12:00:00.000Z',
            estimatedMinutes: 45,
          }),
        ],
        calendars: [],
        lists: [],
      },
      context,
    );
    expect(section?.items.map((item) => item.key)).toEqual(['task:late', 'task:done']);
    expect(section?.items[0]).toMatchObject({
      primary: '3 days overdue',
      primaryTone: 'danger',
      details: ['Inbox', '45m'],
      badges: [{ label: 'Urgent', tone: 'danger' }],
    });
    expect(section?.items[1]).toMatchObject({ primary: 'Completed', isMuted: true });
  });

  it('shows every match unless a section limit is given, keeping the full total', () => {
    const tasks = ['a', 'b', 'c'].map((id) => task({ id }));
    const data = { events: [], tasks, calendars: [], lists: [] };
    expect(buildSearchSections(data, context)[0]?.items).toHaveLength(3);
    const [limited] = buildSearchSections(data, { ...context, limits: { task: 2 } });
    expect(limited?.items).toHaveLength(2);
    expect(limited?.total).toBe(3);
  });
});

describe('relativeDayLabel', () => {
  it('uses relative words near today and a short date otherwise', () => {
    expect(relativeDayLabel(new Date('2026-09-22T12:00:00-04:00'), NOW, TZ)).toBe('Yesterday');
    expect(relativeDayLabel(new Date('2026-10-02T12:00:00-04:00'), NOW, TZ)).toBe('Fri, Oct 2');
    expect(relativeDayLabel(new Date('2027-01-05T12:00:00-05:00'), NOW, TZ)).toBe(
      'Tue, Jan 5, 2027',
    );
  });
});

describe('matchSnippet', () => {
  it('returns nothing when the title already matches', () => {
    expect(matchSnippet('Quarterly report', 'the report is due', 'report')).toBeNull();
  });

  it('excerpts the notes around the match', () => {
    const notes = `${'a '.repeat(60)}bring the budget sheet ${'b '.repeat(60)}`;
    const snippet = matchSnippet('Planning', notes, 'budget', 10);
    expect(snippet).toBe('…bring the budget sheet b b…');
  });
});

describe('splitHighlight', () => {
  it('marks every case-insensitive match', () => {
    expect(splitHighlight('Team sync / TEAM lunch', 'team')).toEqual([
      { text: 'Team', isMatch: true },
      { text: ' sync / ', isMatch: false },
      { text: 'TEAM', isMatch: true },
      { text: ' lunch', isMatch: false },
    ]);
  });
});
