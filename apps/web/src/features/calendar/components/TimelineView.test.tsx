import type { CalendarEvent } from '@cal/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TimelineView } from './TimelineView';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

const mockNow = new Date('2026-09-15T10:00:00.000Z');
const timeZone = 'America/New_York';
const dateKeys = [
  '2026-09-13',
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-19',
];

const makeEvent = (overrides: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'a0000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  calendarId: 'b0000000-0000-0000-0000-000000000001',
  title: 'Company Holiday',
  description: null,
  location: null,
  startAt: '2026-09-15T00:00:00.000Z',
  endAt: '2026-09-16T00:00:00.000Z',
  allDay: true,
  timezone: 'America/New_York',
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
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('TimelineView grid layout and all-day handling', () => {
  it('does not apply timelineCanvasWithAllDay when there are no all-day events', () => {
    const byDateKey = new Map<string, EventOccurrence[]>();

    const html = renderToStaticMarkup(
      <TimelineView
        dateKeys={dateKeys}
        byDateKey={byDateKey}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    );

    // Should NOT have the all-day modifier class
    expect(html).not.toContain('timelineCanvasWithAllDay');
    // Should NOT render all-day grid or label
    expect(html).not.toContain('all-day');
    expect(html).not.toContain('allDayGrid');
    // Should render day headers and day columns
    expect(html).toContain('dayHeaders');
    expect(html).toContain('dayColumns');
    expect(html).toContain('hourLabels');
  });

  it('applies timelineCanvasWithAllDay and renders all-day grid when all-day events exist', () => {
    const event = makeEvent({ allDay: true, title: 'Company Holiday' });
    const allDayOccurrence: EventOccurrence = {
      key: 'occ-1',
      occurrenceIndex: 0,
      start: new Date(event.startAt).getTime(),
      end: new Date(event.endAt).getTime(),
      event,
      calendar: undefined,
    };

    const byDateKey = new Map<string, EventOccurrence[]>([['2026-09-15', [allDayOccurrence]]]);

    const html = renderToStaticMarkup(
      <TimelineView
        dateKeys={dateKeys}
        byDateKey={byDateKey}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    );

    // Must have the all-day modifier class to size grid rows correctly
    expect(html).toContain('timelineCanvasWithAllDay');
    // Must render all-day section
    expect(html).toContain('all-day');
    expect(html).toContain('Company Holiday');
  });

  it('renders correctly in single-day mode without all-day events', () => {
    const byDateKey = new Map<string, EventOccurrence[]>();

    const html = renderToStaticMarkup(
      <TimelineView
        dateKeys={['2026-09-15']}
        byDateKey={byDateKey}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    );

    expect(html).toContain('dayCanvas');
    expect(html).not.toContain('timelineCanvasWithAllDay');
    expect(html).not.toContain('all-day');
  });

  it('applies firstHourLabel to hour 0 to prevent 12 AM from being cut off by the header', () => {
    const byDateKey = new Map<string, EventOccurrence[]>();

    const html = renderToStaticMarkup(
      <TimelineView
        dateKeys={dateKeys}
        byDateKey={byDateKey}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
      />,
    );

    expect(html).toContain('firstHourLabel');
    expect(html).toContain('12 AM');
  });

  it('applies bubble enter animation to timed draft in week view', () => {
    const byDateKey = new Map<string, EventOccurrence[]>();

    const html = renderToStaticMarkup(
      <TimelineView
        dateKeys={dateKeys}
        byDateKey={byDateKey}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
        draftEvent={{
          dateKey: '2026-09-15',
          startMinute: 600,
          endMinute: 660,
          allDay: false,
          title: 'New Session',
        }}
      />,
    );

    expect(html).toContain('draftTimelineEvent');
    expect(html).toContain('draftTimelineEventBubbleEnter');
    expect(html).not.toContain('draftTimelineEventBubbleExit');
  });

  it('applies bubble exit animation to timed draft in week view when cancelling', () => {
    const byDateKey = new Map<string, EventOccurrence[]>();

    const html = renderToStaticMarkup(
      <TimelineView
        dateKeys={dateKeys}
        byDateKey={byDateKey}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
        draftEvent={{
          dateKey: '2026-09-15',
          startMinute: 600,
          endMinute: 660,
          allDay: false,
          title: 'New Session',
          isClosing: true,
        }}
      />,
    );

    expect(html).toContain('draftTimelineEvent');
    expect(html).toContain('draftTimelineEventBubbleExit');
    expect(html).not.toContain('draftTimelineEventBubbleEnter');
  });

  it('does NOT apply bubble animation to timed draft in day view', () => {
    const byDateKey = new Map<string, EventOccurrence[]>();

    const html = renderToStaticMarkup(
      <TimelineView
        dateKeys={['2026-09-15']}
        byDateKey={byDateKey}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
        draftEvent={{
          dateKey: '2026-09-15',
          startMinute: 600,
          endMinute: 660,
          allDay: false,
          title: 'New Session',
        }}
      />,
    );

    expect(html).toContain('draftTimelineEvent');
    expect(html).not.toContain('draftTimelineEventBubbleEnter');
    expect(html).not.toContain('draftTimelineEventBubbleExit');
  });
});
