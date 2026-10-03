import type { Calendar, CalendarEvent, Task } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { widgetSnapshotSchema, type WidgetSnapshot } from '../schema';
import { buildWidgetSnapshot, type WidgetSnapshotInput } from './build-snapshot';

const USER = '22222222-2222-2222-2222-222222222222';
const WORK = '11111111-1111-1111-1111-111111111111';
const HIDDEN = '33333333-3333-3333-3333-333333333333';

function calendar(overrides: Partial<Calendar> = {}): Calendar {
  return {
    id: WORK,
    userId: USER,
    name: 'Work',
    color: '#6E8BFF',
    sourceType: 'google',
    providerAccountId: null,
    providerCalendarId: null,
    isVisible: true,
    isDefault: true,
    isReadOnly: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

let eventCounter = 0;
function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  eventCounter += 1;
  return {
    id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(eventCounter).padStart(12, '0')}`,
    userId: USER,
    calendarId: WORK,
    title: 'Standup',
    description: null,
    location: null,
    color: null,
    startAt: '2026-10-02T09:00:00.000Z',
    endAt: '2026-10-02T09:30:00.000Z',
    allDay: false,
    timezone: 'Europe/London',
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
  };
}

let taskCounter = 0;
function task(overrides: Partial<Task> = {}): Task {
  taskCounter += 1;
  return {
    id: `bbbbbbbb-bbbb-bbbb-bbbb-${String(taskCounter).padStart(12, '0')}`,
    userId: USER,
    listId: null,
    title: 'Write report',
    description: null,
    status: 'open',
    priority: 'normal',
    dueAt: '2026-10-02T11:00:00.000Z',
    hasDueTime: false,
    estimatedMinutes: null,
    scheduledEventId: null,
    isFlexible: false,
    recurrenceRule: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function input(overrides: Partial<WidgetSnapshotInput> = {}): WidgetSnapshotInput {
  return {
    // 10:00 in London (BST) on Friday 2 October 2026.
    now: new Date('2026-10-02T09:00:00.000Z'),
    timeZone: 'Europe/London',
    weekStartsOn: 1,
    hourCycle: 'h23',
    events: [],
    calendars: [calendar()],
    hiddenCalendarIds: [],
    tasks: [],
    fallbackColor: '#196AF3',
    ...overrides,
  };
}

const dayOf = (snapshot: WidgetSnapshot, key: string) =>
  snapshot.days.find((day) => day.key === key);

describe('buildWidgetSnapshot', () => {
  it('produces a snapshot the widget contract accepts', () => {
    const snapshot = buildWidgetSnapshot(input({ events: [event()], tasks: [task()] }));
    expect(() => widgetSnapshotSchema.parse(snapshot)).not.toThrow();
  });

  it('starts the week on the user’s week start and spans the paging months', () => {
    const snapshot = buildWidgetSnapshot(input());
    expect(snapshot.weekdayLabels).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(snapshot.months.map((month) => month.key)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
    ]);

    const october = snapshot.months[1];
    // 1 October 2026 is a Thursday, so a Monday grid opens on 28 September.
    expect(october?.weeks[0]?.[0]).toMatchObject({ key: '2026-09-28', inMonth: false });
    expect(october?.weeks[0]?.[3]).toMatchObject({ key: '2026-10-01', day: 1, inMonth: true });
  });

  it('labels times in the user’s zone and clock, and resolves colours', () => {
    const snapshot = buildWidgetSnapshot(
      input({ hourCycle: 'h12', events: [event({ color: '#3ECF8E', location: 'Studio' })] }),
    );
    const today = dayOf(snapshot, '2026-10-02');

    expect(today).toMatchObject({ key: '2026-10-02', weekday: 'Friday', dateLabel: '2 October' });
    expect(today?.events[0]).toMatchObject({
      startLabel: '10:00 AM',
      endLabel: '10:30 AM',
      color: '#3ECF8E',
      location: 'Studio',
    });
  });

  it('leaves out hidden calendars and cancelled events', () => {
    const snapshot = buildWidgetSnapshot(
      input({
        calendars: [calendar(), calendar({ id: HIDDEN, name: 'Hidden' })],
        hiddenCalendarIds: [HIDDEN],
        events: [
          event({ title: 'Kept' }),
          event({ title: 'Hidden', calendarId: HIDDEN }),
          event({ title: 'Cancelled', status: 'cancelled' }),
        ],
      }),
    );

    expect(dayOf(snapshot, '2026-10-02')?.events.map((item) => item.title)).toEqual(['Kept']);
    const cell = snapshot.months[1]?.weeks[0]?.find((day) => day.key === '2026-10-02');
    expect(cell).toMatchObject({ count: 1, colors: ['#6E8BFF'] });
  });

  it('lists an event crossing midnight on both days', () => {
    const snapshot = buildWidgetSnapshot(
      input({
        events: [
          event({
            title: 'Night shift',
            startAt: '2026-10-02T21:00:00.000Z',
            endAt: '2026-10-03T05:00:00.000Z',
          }),
        ],
      }),
    );

    // 22:00–06:00 London time: the tail of the first day, the head of the next.
    expect(dayOf(snapshot, '2026-10-02')?.events[0]).toMatchObject({
      startMinute: 22 * 60,
      endMinute: 1440,
    });
    expect(dayOf(snapshot, '2026-10-03')?.events[0]).toMatchObject({
      startMinute: 0,
      endMinute: 6 * 60,
    });
  });

  it('places events in their day in local minutes, ending at midnight as 1440', () => {
    const snapshot = buildWidgetSnapshot(
      input({
        events: [
          event({ title: 'Morning' }),
          event({
            title: 'Late',
            startAt: '2026-10-02T21:30:00.000Z',
            endAt: '2026-10-02T23:00:00.000Z',
          }),
          event({
            title: 'Holiday',
            allDay: true,
            startAt: '2026-10-02T00:00:00.000Z',
            endAt: '2026-10-03T00:00:00.000Z',
          }),
        ],
      }),
    );
    const minutes = dayOf(snapshot, '2026-10-02')?.events.map((item) => [
      item.title,
      item.startMinute,
      item.endMinute,
    ]);

    expect(minutes).toEqual([
      ['Holiday', 0, 1440],
      ['Morning', 600, 630],
      ['Late', 22 * 60 + 30, 1440],
    ]);
  });

  it('offers this week and the next, with every day of both listed in full', () => {
    const snapshot = buildWidgetSnapshot(input());

    expect(snapshot.weeks.map((week) => [week.key, week.label])).toEqual([
      ['2026-09-28', '28 Sep – 4 Oct'],
      ['2026-10-05', '5 – 11 Oct'],
    ]);
    const listed = new Set(snapshot.days.map((day) => day.key));
    for (const key of snapshot.weeks.flatMap((week) => week.days)) {
      expect(listed.has(key)).toBe(true);
    }
    // From Monday of this week to thirteen days after today, in order.
    expect(snapshot.days[0]?.key).toBe('2026-09-28');
    expect(snapshot.days[snapshot.days.length - 1]?.key).toBe('2026-10-15');
  });

  it('puts overdue tasks first, then today’s, then those finished today', () => {
    const snapshot = buildWidgetSnapshot(
      input({
        tasks: [
          task({ title: 'Today' }),
          task({ title: 'Late', dueAt: '2026-09-30T11:00:00.000Z' }),
          task({
            title: 'Done',
            status: 'completed',
            completedAt: '2026-10-02T08:00:00.000Z',
          }),
          task({ title: 'Next week', dueAt: '2026-10-09T11:00:00.000Z' }),
        ],
      }),
    );

    expect(snapshot.tasks.map((item) => [item.title, item.overdue, item.completed])).toEqual([
      ['Late', true, false],
      ['Today', false, false],
      ['Done', false, true],
    ]);
  });

  it('counts the open tasks it had no room for', () => {
    const tasks = Array.from({ length: 11 }, (_, index) => task({ title: `Task ${index}` }));
    const snapshot = buildWidgetSnapshot(input({ tasks }));

    expect(snapshot.tasks).toHaveLength(8);
    expect(snapshot.moreTaskCount).toBe(3);
  });
});
