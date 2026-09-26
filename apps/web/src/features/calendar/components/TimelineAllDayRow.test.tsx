import type { Calendar, CalendarEvent } from '@cal/schemas';
import type { MouseEvent, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import styles from './CalendarView.module.css';
import { TimelineAllDayRow, type TimelineAllDayRowProps } from './TimelineAllDayRow';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

const timeZone = 'America/New_York';
const dateKeys = ['2026-09-15', '2026-09-16'];

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

const event: CalendarEvent = {
  id: 'a0000000-0000-0000-0000-000000000001',
  userId: calendar.userId,
  calendarId: calendar.id,
  title: 'Company Holiday',
  description: null,
  location: null,
  startAt: '2026-09-15T04:00:00.000Z',
  endAt: '2026-09-16T04:00:00.000Z',
  allDay: true,
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
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  color: null,
};

const holiday: EventOccurrence = {
  key: 'occ-holiday',
  occurrenceIndex: 0,
  start: Date.parse(event.startAt),
  end: Date.parse(event.endAt),
  event,
  calendar,
};

function props(overrides: Partial<TimelineAllDayRowProps> = {}): TimelineAllDayRowProps {
  return {
    dateKeys,
    allDayByDate: new Map([
      ['2026-09-15', [holiday]],
      ['2026-09-16', []],
    ]),
    timeZone,
    hourCycle: 'h12',
    onSelectEvent: vi.fn(),
    ...overrides,
  };
}

type ColumnElement = ReactElement<{ onClick: (e: MouseEvent<HTMLDivElement>) => void }>;

/** The per-day column elements, read from the rendered tree (no DOM needed). */
function columns(rowProps: TimelineAllDayRowProps): ColumnElement[] {
  const row = TimelineAllDayRow(rowProps) as ReactElement<{ children: ReactElement[] }>;
  const grid = row.props.children[1] as ReactElement<{ children: ColumnElement[] }>;
  return grid.props.children;
}

const rect = { top: 40, bottom: 64, left: 100, right: 250, width: 150, height: 24 };

function click(insideSelector: string | null): {
  event: MouseEvent<HTMLDivElement>;
  closest: ReturnType<typeof vi.fn>;
} {
  const closest = vi.fn((selector: string) => (selector === insideSelector ? {} : null));
  const event = {
    target: { closest },
    currentTarget: { getBoundingClientRect: () => rect },
  } as unknown as MouseEvent<HTMLDivElement>;
  return { event, closest };
}

describe('TimelineAllDayRow', () => {
  it('renders the label and one column per day with compact event buttons', () => {
    const html = renderToStaticMarkup(<TimelineAllDayRow {...props()} />);

    expect(html.startsWith(`<div class="${styles.allDayLabel}">all-day</div>`)).toBe(true);
    expect(html.match(new RegExp(`class="${styles.allDayColumn}"`, 'g'))).toHaveLength(2);
    expect(html).toContain('Company Holiday');
    expect(html).toContain(styles.timelineEventCompact);
  });

  it('shows the all-day draft only in its own column and never a timed draft', () => {
    const allDay = renderToStaticMarkup(
      <TimelineAllDayRow
        {...props({ draftEvent: { dateKey: '2026-09-16', allDay: true, title: 'Offsite' } })}
      />,
    );
    const secondColumn = allDay.slice(allDay.lastIndexOf(`class="${styles.allDayColumn}"`));
    expect(secondColumn).toContain(styles.monthEventDraft);
    expect(secondColumn).toContain('Offsite');
    expect(allDay.match(new RegExp(`${styles.monthEventDraft} `, 'g'))).toHaveLength(1);

    const timed = renderToStaticMarkup(
      <TimelineAllDayRow
        {...props({ draftEvent: { dateKey: '2026-09-15', startMinute: 540, endMinute: 600 } })}
      />,
    );
    expect(timed).not.toContain(styles.monthEventDraft);
  });

  it('selects an all-day slot anchored to the clicked column', () => {
    const onSelectSlot = vi.fn();
    const { event: clickEvent, closest } = click(null);

    columns(props({ onSelectSlot }))[1]!.props.onClick(clickEvent);

    expect(closest).toHaveBeenCalledWith(`.${styles.timelineEvent}`);
    expect(onSelectSlot).toHaveBeenCalledWith({
      dateKey: '2026-09-16',
      allDay: true,
      anchorRect: rect,
    });
  });

  it('does not select a slot when the click lands on an event or the draft chip', () => {
    const onSelectSlot = vi.fn();

    columns(props({ onSelectSlot }))[0]!.props.onClick(click(`.${styles.timelineEvent}`).event);

    expect(onSelectSlot).not.toHaveBeenCalled();
  });

  it('ignores empty-space clicks when slot selection is not wired', () => {
    expect(() => columns(props())[0]!.props.onClick(click(null).event)).not.toThrow();
  });
});
