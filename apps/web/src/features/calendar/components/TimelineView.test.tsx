import type { Calendar, CalendarEvent } from '@cal/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { EventButton, TimelineView } from './TimelineView';
import type { EventOccurrence } from '../hooks/useCalendarWindow';
import { calculateAutoScrollVelocity, clampScrollTop } from '../utils/event-auto-scroll';

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

const calendar: Calendar = {
  id: 'b0000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Personal',
  color: '#6E8BFF',
  sourceType: 'internal',
  providerAccountId: null,
  providerCalendarId: null,
  isVisible: true,
  isDefault: true,
  isReadOnly: false,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

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

  it('applies bubble animation to timed draft in day view', () => {
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
    expect(html).toContain('draftTimelineEventBubbleEnter');
    expect(html).not.toContain('draftTimelineEventBubbleExit');
  });
});

describe('TimelineView resize affordances', () => {
  function renderTimedEvent(eventCalendar: Calendar, recurrenceRule: string | null = null) {
    const event = makeEvent({
      allDay: false,
      title: 'Planning session',
      startAt: '2026-09-15T14:00:00.000Z',
      endAt: '2026-09-15T15:00:00.000Z',
      recurrenceRule,
    });
    const occurrence: EventOccurrence = {
      key: 'timed-occurrence',
      occurrenceIndex: 0,
      start: Date.parse(event.startAt),
      end: Date.parse(event.endAt),
      event,
      calendar: eventCalendar,
    };

    return renderToStaticMarkup(
      <TimelineView
        dateKeys={['2026-09-15']}
        byDateKey={new Map([['2026-09-15', [occurrence]]])}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
        onResizeEvent={vi.fn()}
        onSelectSlot={vi.fn()}
      />,
    );
  }

  it('renders two edge hit targets inside the normal clickable event body', () => {
    const html = renderTimedEvent(calendar);
    expect(html).toContain('data-resize-edge="start"');
    expect(html).toContain('data-resize-edge="end"');
    expect(html).toContain('<button');
    expect(html).toContain('Planning session');
  });

  it('does not expose resize handles for read-only or generated recurring events', () => {
    expect(renderTimedEvent({ ...calendar, isReadOnly: true })).not.toContain('data-resize-edge');
    expect(renderTimedEvent(calendar, 'FREQ=WEEKLY')).not.toContain('data-resize-edge');
  });

  it('hides event title and shows only time span and duration when dragging an event less than 45 minutes', () => {
    const event = makeEvent({
      allDay: false,
      title: 'Quick Sync',
      startAt: '2026-09-15T14:00:00.000Z',
      endAt: '2026-09-15T14:30:00.000Z',
    });
    const occurrence: EventOccurrence = {
      key: 'quick-sync',
      occurrenceIndex: 0,
      start: Date.parse(event.startAt),
      end: Date.parse(event.endAt),
      event,
      calendar,
    };

    const html = renderToStaticMarkup(
      <EventButton
        occurrence={occurrence}
        timeZone={timeZone}
        hourCycle="h12"
        compact={false}
        onSelect={vi.fn()}
        resizePreview={{ startMinute: 600, endMinute: 630 }} // 30 minutes (< 45m)
      />,
    );

    // Should have short resizing modifiers
    expect(html).toContain('timelineEventResizingShort');
    expect(html).toContain('timelineEventTitleResizingShort');
    expect(html).toContain('timelineResizeFeedbackShort');
    // Displays time span and duration badge
    expect(html).toContain('10:00 AM – 10:30 AM');
    expect(html).toContain('30m');
    expect(html).toContain('timelineResizeDurationBadge');
  });

  it('shows event title, time span, and duration once resize reaches at least 45 minutes', () => {
    const event = makeEvent({
      allDay: false,
      title: 'Team Workshop',
      startAt: '2026-09-15T14:00:00.000Z',
      endAt: '2026-09-15T14:45:00.000Z',
    });
    const occurrence: EventOccurrence = {
      key: 'team-workshop',
      occurrenceIndex: 0,
      start: Date.parse(event.startAt),
      end: Date.parse(event.endAt),
      event,
      calendar,
    };

    const html = renderToStaticMarkup(
      <EventButton
        occurrence={occurrence}
        timeZone={timeZone}
        hourCycle="h12"
        compact={false}
        onSelect={vi.fn()}
        resizePreview={{ startMinute: 600, endMinute: 645 }} // 45 minutes (>= 45m)
      />,
    );

    // Should NOT have short resizing modifiers
    expect(html).not.toContain('timelineEventResizingShort');
    expect(html).toContain('timelineEventTitleResizingNormal');
    expect(html).toContain('timelineResizeFeedbackNormal');
    // Displays title as well as time span and duration
    expect(html).toContain('Team Workshop');
    expect(html).toContain('10:00 AM – 10:45 AM');
    expect(html).toContain('45m');
  });
});

describe('TimelineView move affordances and live feedback', () => {
  function renderTimelineEvent(eventCalendar: Calendar, recurrenceRule: string | null = null) {
    const event = makeEvent({
      allDay: false,
      title: 'Design Review',
      startAt: '2026-09-15T14:00:00.000Z',
      endAt: '2026-09-15T15:00:00.000Z',
      recurrenceRule,
    });
    const occurrence: EventOccurrence = {
      key: 'movable-occurrence',
      occurrenceIndex: 0,
      start: Date.parse(event.startAt),
      end: Date.parse(event.endAt),
      event,
      calendar: eventCalendar,
    };

    return renderToStaticMarkup(
      <TimelineView
        dateKeys={['2026-09-15']}
        byDateKey={new Map([['2026-09-15', [occurrence]]])}
        selectedDateKey="2026-09-15"
        timeZone={timeZone}
        hourCycle="h12"
        now={mockNow}
        onSelectDate={vi.fn()}
        onSelectEvent={vi.fn()}
        onResizeEvent={vi.fn()}
        onMoveEvent={vi.fn()}
        onSelectSlot={vi.fn()}
      />,
    );
  }

  it('marks normal writable timed events as movable', () => {
    const html = renderTimelineEvent(calendar);
    expect(html).toContain('timelineEventMovable');
    expect(html).toContain('<button');
    expect(html).toContain('Design Review');
  });

  it('does not mark read-only or recurring events as movable', () => {
    expect(renderTimelineEvent({ ...calendar, isReadOnly: true })).not.toContain(
      'timelineEventMovable',
    );
    expect(renderTimelineEvent(calendar, 'FREQ=WEEKLY')).not.toContain('timelineEventMovable');
  });

  it('keeps resize handles independent and mutually exclusive with move targets', () => {
    const html = renderTimelineEvent(calendar);
    // Resize handles have explicit data attributes and classes
    expect(html).toContain('data-resize-edge="start"');
    expect(html).toContain('data-resize-edge="end"');
    expect(html).toContain('timelineResizeHandleTop');
    expect(html).toContain('timelineResizeHandleBottom');
  });

  it('renders live move feedback with snapped time span for small events (< 45m)', () => {
    const event = makeEvent({
      allDay: false,
      title: 'Daily Standup',
      startAt: '2026-09-15T14:00:00.000Z',
      endAt: '2026-09-15T14:30:00.000Z',
    });
    const occurrence: EventOccurrence = {
      key: 'daily-standup',
      occurrenceIndex: 0,
      start: Date.parse(event.startAt),
      end: Date.parse(event.endAt),
      event,
      calendar,
    };

    const html = renderToStaticMarkup(
      <EventButton
        occurrence={occurrence}
        timeZone={timeZone}
        hourCycle="h12"
        compact={false}
        onSelect={vi.fn()}
        movePreview={{ startMinute: 615, endMinute: 645 }} // 30m (< 45m)
        isMovable
      />,
    );

    expect(html).toContain('timelineEventMoving');
    expect(html).toContain('timelineEventMovingShort');
    expect(html).toContain('timelineEventTitleMovingShort');
    expect(html).toContain('timelineMoveFeedbackShort');
    expect(html).toContain('10:15 AM – 10:45 AM');
    // Invariant duration: no duration pill badge in move
    expect(html).not.toContain('timelineResizeDurationBadge');
  });

  it('renders live move feedback with title and snapped time span for normal events (>= 45m)', () => {
    const event = makeEvent({
      allDay: false,
      title: 'Strategy Session',
      startAt: '2026-09-15T14:00:00.000Z',
      endAt: '2026-09-15T15:00:00.000Z',
    });
    const occurrence: EventOccurrence = {
      key: 'strategy-session',
      occurrenceIndex: 0,
      start: Date.parse(event.startAt),
      end: Date.parse(event.endAt),
      event,
      calendar,
    };

    const html = renderToStaticMarkup(
      <EventButton
        occurrence={occurrence}
        timeZone={timeZone}
        hourCycle="h12"
        compact={false}
        onSelect={vi.fn()}
        movePreview={{ startMinute: 660, endMinute: 720 }} // 60m (>= 45m)
        isMovable
      />,
    );

    expect(html).toContain('timelineEventMoving');
    expect(html).not.toContain('timelineEventMovingShort');
    expect(html).toContain('timelineEventTitleMovingNormal');
    expect(html).toContain('timelineMoveFeedbackNormal');
    expect(html).toContain('Strategy Session');
    expect(html).toContain('11:00 AM – 12:00 PM');
    expect(html).not.toContain('timelineResizeDurationBadge');
  });

  describe('TimelineView magnetic snapping affordances and feedback', () => {
    it('applies timelineEventMagnetized class to EventButton when magnetized', () => {
      const event = makeEvent({
        allDay: false,
        title: 'Standup',
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T15:00:00.000Z',
      });
      const occurrence: EventOccurrence = {
        key: 'standup-key',
        occurrenceIndex: 0,
        start: Date.parse(event.startAt),
        end: Date.parse(event.endAt),
        event,
        calendar,
      };

      const htmlMagnetized = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          movePreview={{ startMinute: 600, endMinute: 660 }}
          isMovable
          isMagnetized
        />,
      );

      expect(htmlMagnetized).toContain('timelineEventMagnetized');

      const htmlUnmagnetized = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          movePreview={{ startMinute: 600, endMinute: 660 }}
          isMovable
          isMagnetized={false}
        />,
      );

      expect(htmlUnmagnetized).not.toContain('timelineEventMagnetized');
    });

    it('applies timelineEventMagnetized during resize when isMagnetized is true', () => {
      const event = makeEvent({
        allDay: false,
        title: 'Deep Work',
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T16:00:00.000Z',
      });
      const occurrence: EventOccurrence = {
        key: 'deep-work-key',
        occurrenceIndex: 0,
        start: Date.parse(event.startAt),
        end: Date.parse(event.endAt),
        event,
        calendar,
      };

      const html = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          resizePreview={{ startMinute: 600, endMinute: 720 }}
          isMagnetized
        />,
      );

      expect(html).toContain('timelineEventResizing');
      expect(html).toContain('timelineEventMagnetized');
    });
  });

  describe('TimelineView live conflict feedback affordances', () => {
    it('applies timelineEventConflicted class and renders Conflict badge on EventButton when hasConflict is true during move', () => {
      const event = makeEvent({
        allDay: false,
        title: 'Standup',
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T15:00:00.000Z',
      });
      const occurrence: EventOccurrence = {
        key: 'standup-key',
        occurrenceIndex: 0,
        start: Date.parse(event.startAt),
        end: Date.parse(event.endAt),
        event,
        calendar,
      };

      const htmlConflicted = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          movePreview={{ startMinute: 600, endMinute: 660 }}
          isMovable
          hasConflict
        />,
      );

      expect(htmlConflicted).toContain('timelineEventConflicted');
      expect(htmlConflicted).toContain('timelineConflictBadge');
      expect(htmlConflicted).toContain('Conflict');

      const htmlUnconflicted = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          movePreview={{ startMinute: 600, endMinute: 660 }}
          isMovable
          hasConflict={false}
        />,
      );

      expect(htmlUnconflicted).not.toContain('timelineEventConflicted');
      expect(htmlUnconflicted).not.toContain('timelineConflictBadge');
    });

    it('applies timelineEventConflicted class and renders Conflict badge during resize when hasConflict is true', () => {
      const event = makeEvent({
        allDay: false,
        title: 'Deep Work',
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T16:00:00.000Z',
      });
      const occurrence: EventOccurrence = {
        key: 'deep-work-key',
        occurrenceIndex: 0,
        start: Date.parse(event.startAt),
        end: Date.parse(event.endAt),
        event,
        calendar,
      };

      const html = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          resizePreview={{ startMinute: 600, endMinute: 720 }}
          hasConflict
        />,
      );

      expect(html).toContain('timelineEventResizing');
      expect(html).toContain('timelineEventConflicted');
      expect(html).toContain('timelineConflictBadge');
      expect(html).toContain('Conflict');
    });
  });

  describe('TimelineView release settle animation affordances', () => {
    it('applies timelineEventSettled class to EventButton when isSettled is true and not previewing', () => {
      const event = makeEvent({
        allDay: false,
        title: 'Settled Meeting',
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T15:00:00.000Z',
      });
      const occurrence: EventOccurrence = {
        key: 'settled-meeting-key',
        occurrenceIndex: 0,
        start: Date.parse(event.startAt),
        end: Date.parse(event.endAt),
        event,
        calendar,
      };

      const htmlSettled = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          isMovable
          isSettled
        />,
      );

      expect(htmlSettled).toContain('timelineEventSettled');

      const htmlNotSettled = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          isMovable
          isSettled={false}
        />,
      );

      expect(htmlNotSettled).not.toContain('timelineEventSettled');
    });

    it('does not apply timelineEventSettled class while active preview is present', () => {
      const event = makeEvent({
        allDay: false,
        title: 'Moving Meeting',
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T15:00:00.000Z',
      });
      const occurrence: EventOccurrence = {
        key: 'moving-meeting-key',
        occurrenceIndex: 0,
        start: Date.parse(event.startAt),
        end: Date.parse(event.endAt),
        event,
        calendar,
      };

      const html = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          isMovable
          movePreview={{ startMinute: 600, endMinute: 660 }}
          isSettled
        />,
      );

      expect(html).not.toContain('timelineEventSettled');
      expect(html).toContain('timelineEventMoving');
    });

    it('does not retain conflict or magnetic state when settled', () => {
      const event = makeEvent({
        allDay: false,
        title: 'Clean Settle Meeting',
        startAt: '2026-09-15T14:00:00.000Z',
        endAt: '2026-09-15T15:00:00.000Z',
      });
      const occurrence: EventOccurrence = {
        key: 'clean-settle-key',
        occurrenceIndex: 0,
        start: Date.parse(event.startAt),
        end: Date.parse(event.endAt),
        event,
        calendar,
      };

      const html = renderToStaticMarkup(
        <EventButton
          occurrence={occurrence}
          timeZone={timeZone}
          hourCycle="h12"
          compact={false}
          onSelect={vi.fn()}
          isMovable
          isSettled
          isMagnetized={false}
          hasConflict={false}
        />,
      );

      expect(html).toContain('timelineEventSettled');
      expect(html).not.toContain('timelineEventMagnetized');
      expect(html).not.toContain('timelineEventConflicted');
      expect(html).not.toContain('timelineConflictBadge');
    });
  });

  describe('TimelineView auto-scroll edge velocity and viewport coordination', () => {
    it('calculates expected velocities across top, center deadband, and bottom zones', () => {
      const viewport = { top: 100, bottom: 900, height: 800 };
      // Center zone (deadband): velocity is 0
      expect(calculateAutoScrollVelocity(500, viewport)).toBe(0);

      // Top edge zone: negative velocity (scroll up)
      const topVelocity = calculateAutoScrollVelocity(120, viewport);
      expect(topVelocity).toBeLessThan(0);

      // Bottom edge zone: positive velocity (scroll down)
      const bottomVelocity = calculateAutoScrollVelocity(880, viewport);
      expect(bottomVelocity).toBeGreaterThan(0);
    });

    it('correctly bounds container scrollTop with clampScrollTop', () => {
      // Within bounds
      expect(clampScrollTop(250, 1000, 600)).toBe(250);
      // Below 0 -> clamped to 0
      expect(clampScrollTop(-50, 1000, 600)).toBe(0);
      // Above maxScroll (1000 - 600 = 400) -> clamped to 400
      expect(clampScrollTop(450, 1000, 600)).toBe(400);
      // Non-scrollable container -> clamped to 0
      expect(clampScrollTop(50, 500, 600)).toBe(0);
    });
  });
});
