import type { Calendar, CalendarEvent } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  buildSearchSections,
  matchSnippet,
  resolveSearchStatus,
  sortEventsForSearch,
  splitHighlight,
} from './search-results';

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

const context = { query: 'plan', now: NOW, timeZone: TZ, hourCycle: 'h23' as const, lists: [] };

describe('sortEventsForSearch', () => {
  it('puts upcoming events first, soonest first, then the most recent past', () => {
    const sorted = sortEventsForSearch(
      [
        event('past-old', '2026-09-01T09:00:00-04:00', '2026-09-01T10:00:00-04:00'),
        event('later', '2026-09-30T09:00:00-04:00', '2026-09-30T10:00:00-04:00'),
        event('past-recent', '2026-09-22T09:00:00-04:00', '2026-09-22T10:00:00-04:00'),
        event('soon', '2026-09-24T09:00:00-04:00', '2026-09-24T10:00:00-04:00'),
      ],
      NOW,
    );
    expect(sorted.map((item) => item.id)).toEqual(['soon', 'later', 'past-recent', 'past-old']);
  });
});

describe('buildSearchSections', () => {
  it('describes an ongoing event with its calendar colour and a Now badge', () => {
    const [section] = buildSearchSections(
      {
        events: [
          event('now', '2026-09-23T11:30:00-04:00', '2026-09-23T12:30:00-04:00', {
            location: 'Room 4',
          }),
        ],
        tasks: [],
        calendars: [calendar],
      },
      context,
    );

    expect(section?.kind).toBe('event');
    const item = section?.items[0];
    expect(item?.id).toBe('now');
    expect(item?.color).toBe('#3366ff');
    expect(item?.primary).toBe('Today · 11:30 – 12:30');
    expect(item?.primaryTone).toBe('accent');
    expect(item?.badges).toEqual([{ label: 'Now', tone: 'accent' }]);
    expect(item?.details).toEqual(['1h', 'Room 4', 'Work']);
    expect(item?.isMuted).toBe(false);
  });

  it('drops empty sections', () => {
    expect(buildSearchSections({ events: [], tasks: [], calendars: [] }, context)).toEqual([]);
  });
});

describe('matchSnippet', () => {
  it('returns nothing when the title already explains the match', () => {
    expect(matchSnippet('Plan the offsite', 'We plan to go', 'plan')).toBeNull();
  });

  it('excerpts the notes around the first match', () => {
    expect(matchSnippet('Offsite', 'Bring the budget plan and snacks', 'plan')).toBe(
      'Bring the budget plan and snacks',
    );
  });
});

describe('splitHighlight', () => {
  it('marks every case-insensitive match', () => {
    expect(splitHighlight('Plan a plan', 'plan')).toEqual([
      { text: 'Plan', isMatch: true },
      { text: ' a ', isMatch: false },
      { text: 'plan', isMatch: true },
    ]);
  });
});

describe('resolveSearchStatus', () => {
  it('keeps earlier results on screen while the next query loads', () => {
    expect(
      resolveSearchStatus({ query: 'plan', isSearching: true, isError: false, itemCount: 3 }),
    ).toBe('results');
    expect(
      resolveSearchStatus({ query: 'plan', isSearching: true, isError: false, itemCount: 0 }),
    ).toBe('loading');
    expect(
      resolveSearchStatus({ query: 'p', isSearching: false, isError: false, itemCount: 0 }),
    ).toBe('short');
  });
});
