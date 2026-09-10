import type { Calendar } from '@cal/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QuickCreatePopover } from './QuickCreatePopover';
import type { EventOccurrence } from '../utils/calendar-occurrences';

vi.mock('../../tasks/hooks/useTasks', () => ({
  useTaskLists: () => ({
    data: [
      { id: 'list-1', name: 'Work', color: '#4766db', position: 0, userId: 'u1' },
      { id: 'list-2', name: 'Personal', color: '#61d6a2', position: 1, userId: 'u1' },
    ],
  }),
}));

const mockCalendars: Calendar[] = [
  {
    id: 'cal-1',
    userId: 'u1',
    name: 'Work Calendar',
    color: '#4766db',
    isVisible: true,
    isDefault: true,
    isReadOnly: false,
    sourceType: 'internal',
    providerAccountId: null,
    providerCalendarId: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'cal-2',
    userId: 'u1',
    name: 'Read Only Cal',
    color: '#ff7d84',
    isVisible: true,
    isDefault: false,
    isReadOnly: true,
    sourceType: 'internal',
    providerAccountId: null,
    providerCalendarId: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
];

describe('QuickCreatePopover', () => {
  const defaultProps = {
    isOpen: true,
    anchorRect: {
      top: 200,
      left: 300,
      right: 450,
      bottom: 260,
      width: 150,
      height: 60,
    },
    selectedDateKey: '2026-09-15',
    initialStartTime: '10:00',
    initialEndTime: '11:00',
    initialAllDay: false,
    calendars: mockCalendars,
    timeZone: 'America/New_York',
    defaultDurationMinutes: 60,
    isSaving: false,
    onClose: vi.fn(),
    onCreateEvent: vi.fn(async () => {}),
    onCreateTask: vi.fn(async () => {}),
    onMoreOptions: vi.fn(),
    onDraftChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(<QuickCreatePopover {...defaultProps} isOpen={false} />);
    expect(html).toBe('');
  });

  it('renders dialog and form elements when open', () => {
    const html = renderToStaticMarkup(<QuickCreatePopover {...defaultProps} />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Quick create event or task');
    expect(html).toContain('placeholder="Add title"');
    expect(html).toContain('Event');
    expect(html).toContain('Task');
    expect(html).toContain('value="2026-09-15"');
    expect(html).toContain('value="10:00"');
    expect(html).toContain('value="11:00"');
    expect(html).toContain('All day');
    expect(html).toContain('More options');
    expect(html).toContain('Save');
  });

  it('only exposes writable calendars in calendar select', () => {
    const html = renderToStaticMarkup(<QuickCreatePopover {...defaultProps} />);

    expect(html).toContain('Work Calendar');
    expect(html).not.toContain('Read Only Cal');
  });

  it('renders all-day state correctly', () => {
    const html = renderToStaticMarkup(
      <QuickCreatePopover {...defaultProps} initialAllDay={true} />,
    );

    expect(html).toContain('checked');
    // Start and end time inputs should not be present when allDay is true
    expect(html).not.toContain('aria-label="Start time"');
    expect(html).not.toContain('aria-label="End time"');
  });

  it('disables save button when isSaving is true', () => {
    const html = renderToStaticMarkup(<QuickCreatePopover {...defaultProps} isSaving={true} />);

    expect(html).toContain('Saving…');
    expect(html).toContain('disabled');
  });

  it('always renders location and description fields open by default', () => {
    const html = renderToStaticMarkup(<QuickCreatePopover {...defaultProps} />);

    // Location and Description fields must be immediately present without needing to click an expand toggle
    expect(html).toContain('placeholder="Add location"');
    expect(html).toContain('aria-label="Location"');
    expect(html).toContain('placeholder="Add description"');
    expect(html).toContain('aria-label="Description"');
    expect(html).not.toContain('Add location or description');
  });

  it('renders edit mode correctly when editingOccurrence is provided', () => {
    const editingOccurrence: EventOccurrence = {
      key: 'occ-1',
      calendar: mockCalendars[0],
      occurrenceIndex: 0,
      start: new Date('2026-09-15T14:00:00Z').getTime(),
      end: new Date('2026-09-15T15:00:00Z').getTime(),
      event: {
        id: 'event-1',
        userId: 'u1',
        calendarId: 'cal-1',
        title: 'Team Standup',
        description: 'Daily sync',
        location: 'Room 101',
        allDay: false,
        startAt: '2026-09-15T14:00:00Z',
        endAt: '2026-09-15T15:00:00Z',
        timezone: 'America/New_York',
        recurrenceRule: null,
        recurringEventId: null,
        recurrenceOriginalStartAt: null,
        status: 'confirmed' as const,
        sourceType: 'internal' as const,
        providerEventId: null,
        providerEtag: null,
        providerUpdatedAt: null,
        syncStatus: 'synced' as const,
        alerts: [],
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      },
    };

    const html = renderToStaticMarkup(
      <QuickCreatePopover
        {...defaultProps}
        editingOccurrence={editingOccurrence}
        onUpdateEvent={vi.fn(async () => {})}
        onDeleteEvent={vi.fn(async () => {})}
      />,
    );

    expect(html).toContain('Edit event');
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('value="Team Standup"');
    expect(html).toContain('Room 101');
    expect(html).toContain('Daily sync');
    expect(html).toContain('aria-label="Delete event"');
  });
});
