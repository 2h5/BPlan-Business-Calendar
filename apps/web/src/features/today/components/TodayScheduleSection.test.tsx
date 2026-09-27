import type { Calendar, CalendarEvent } from '@cal/schemas';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TodayScheduleSection, type TodayScheduleSectionProps } from './TodayScheduleSection';
import styles from './TodayView.module.css';
import type { EventOccurrence } from '../../calendar/utils/calendar-occurrences';

const timeZone = 'America/New_York';
const calendar: Calendar = {
  id: '22222222-2222-2222-2222-222222222222',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Work',
  color: '#123456',
  sourceType: 'internal',
  providerAccountId: null,
  providerCalendarId: null,
  isVisible: true,
  isDefault: true,
  isReadOnly: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const event: CalendarEvent = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: calendar.userId,
  calendarId: calendar.id,
  title: 'Planning meeting',
  description: null,
  location: 'Room 4',
  color: '#ff6600',
  startAt: '2026-09-27T14:00:00.000Z',
  endAt: '2026-09-27T15:15:00.000Z',
  allDay: false,
  timezone: timeZone,
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
};
const timed: EventOccurrence = {
  key: 'timed:0',
  event,
  calendar,
  start: Date.parse(event.startAt),
  end: Date.parse(event.endAt),
  occurrenceIndex: 0,
};
const allDay: EventOccurrence = {
  ...timed,
  key: 'all-day:0',
  event: {
    ...event,
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Holiday',
    allDay: true,
    color: null,
  },
};

function props(overrides: Partial<TodayScheduleSectionProps> = {}): TodayScheduleSectionProps {
  return {
    headingId: 'schedule-heading',
    allDay: [],
    timed: [],
    now: new Date('2026-09-27T13:00:00.000Z'),
    timeZone,
    hourCycle: 'h12',
    onOpenCalendar: vi.fn(),
    onCreateEvent: vi.fn(),
    onOpenEvent: vi.fn(),
    ...overrides,
  };
}

interface ButtonProps {
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}

function buttonsWithClass(
  node: ReactNode,
  className: string | undefined,
): ReactElement<ButtonProps>[] {
  if (!className) throw new Error('Expected a CSS class');
  if (!isValidElement<ButtonProps>(node)) return [];
  const matches = node.type === 'button' && node.props.className === className ? [node] : [];
  return [
    ...matches,
    ...Children.toArray(node.props.children).flatMap((child) => buttonsWithClass(child, className)),
  ];
}

describe('TodayScheduleSection', () => {
  it('renders the empty timed schedule, heading and actions', () => {
    const input = props();
    const view = TodayScheduleSection(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain(`class="${styles.section}" aria-labelledby="schedule-heading"`);
    expect(html).toContain(`id="schedule-heading" class="${styles.sectionHeading}">Schedule</h2>`);
    expect(html).toContain(`class="${styles.countBadge}">0</span>`);
    expect(html).toContain('Full calendar →');
    expect(html).toContain('Your schedule is clear');
    expect(html).toContain('No timed commitments today. Enjoy uninterrupted focus time.');
    expect(html).toContain('+ Schedule Event');
    expect(html).not.toContain(`class="${styles.timeline}"`);

    buttonsWithClass(view, styles.textNavButton)[0]?.props.onClick?.();
    buttonsWithClass(view, styles.secondaryActionButton)[0]?.props.onClick?.();
    expect(input.onOpenCalendar).toHaveBeenCalledOnce();
    expect(input.onCreateEvent).toHaveBeenCalledOnce();
  });

  it('renders all-day events in supplied order and opens the chosen event', () => {
    const second = {
      ...allDay,
      key: 'all-day:1',
      event: { ...allDay.event, id: '55555555-5555-5555-5555-555555555555', title: 'Offsite' },
    };
    const input = props({ allDay: [allDay, second] });
    const view = TodayScheduleSection(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain(`class="${styles.countBadge}">2</span>`);
    expect(html).toContain(`class="${styles.allDayLabel}">All-Day</span>`);
    expect(html.indexOf('Holiday')).toBeLessThan(html.indexOf('Offsite'));
    expect(html).toContain(`class="${styles.allDayDot}" style="background-color:#123456"`);
    buttonsWithClass(view, styles.allDayPill)[1]?.props.onClick?.();
    expect(input.onOpenEvent).toHaveBeenCalledWith(second.event.id);
  });

  it('renders a timed event with rounded duration, range, color, calendar and location', () => {
    const input = props({ timed: [{ ...timed, end: timed.end + 36_000 }] });
    const view = TodayScheduleSection(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain(`class="${styles.countBadge}">1</span>`);
    expect(html).toContain(`class="${styles.timelineEntry}  "`);
    expect(html).toContain(`class="${styles.timelineDuration}">1h 16m</span>`);
    expect(html).toContain('10:00 AM – 11:15 AM');
    expect(html).toContain('border-color:#ff6600');
    expect(html).toContain(`class="${styles.eventCardColorBar}" style="background-color:#ff6600"`);
    expect(html).toContain(`class="${styles.eventCalendarTag}">Work</span>`);
    expect(html).toContain(`class="${styles.eventLocationTag}">📍 Room 4</span>`);
    buttonsWithClass(view, styles.eventCard)[0]?.props.onClick?.();
    expect(input.onOpenEvent).toHaveBeenCalledWith(event.id);
  });

  it('shows Now and the current class while preserving the full event range', () => {
    const input = props({ timed: [timed], now: new Date('2026-09-27T14:30:00.000Z') });
    const html = renderToStaticMarkup(<TodayScheduleSection {...input} />);

    expect(html).toContain(`${styles.timelineEntry} ${styles.timelineCurrent} `);
    expect(html).toContain(`class="${styles.timelineTime}">Now</time>`);
    expect(html).toContain('10:00 AM – 11:15 AM');
    expect(html).toContain('border-color:#ff6600;background-color:#ff6600');
  });

  it('marks a past event and falls back to Calendar without a calendar record', () => {
    const withoutCalendar = {
      ...timed,
      event: { ...event, color: null, location: null },
      calendar: undefined,
    };
    const input = props({ timed: [withoutCalendar], now: new Date('2026-09-27T16:00:00.000Z') });
    const html = renderToStaticMarkup(<TodayScheduleSection {...input} />);

    expect(html).toContain(`${styles.timelineEntry}  ${styles.timelinePast}`);
    expect(html).toContain(`class="${styles.eventCalendarTag}">Calendar</span>`);
    expect(html).toContain('border-color:var(--color-accent)');
    expect(html).not.toContain(`class="${styles.eventLocationTag}"`);
  });
});
