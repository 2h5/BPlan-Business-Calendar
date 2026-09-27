import type { Calendar } from '@cal/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { QuickCreateEventFields } from './QuickCreateEventFields';

const calendar: Calendar = {
  id: 'cal-1',
  userId: 'user-1',
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
};

const props = {
  startDate: '2026-09-15',
  startDateDisplay: 'Tuesday, September 15',
  onStartDateChange: vi.fn(),
  startTime: '10:00',
  startTimeOptions: [{ value: '10:00', label: '10:00am' }],
  onStartTimeChange: vi.fn(),
  endTime: '11:00',
  endTimePickerOptions: [{ value: '11:00', label: '11:00am', detail: '1 hr' }],
  onEndTimeChange: vi.fn(),
  allDay: false,
  onAllDayChange: vi.fn(),
  writableCalendars: [calendar],
  selectedCalendarColor: calendar.color,
  calendarId: '',
  defaultCalendarId: calendar.id,
  onCalendarChange: vi.fn(),
  location: 'Room 101',
  onLocationChange: vi.fn(),
  description: 'Planning',
  onDescriptionChange: vi.fn(),
};

describe('QuickCreateEventFields', () => {
  it('renders the event fields in order with the supplied calendar fallback', () => {
    const html = renderToStaticMarkup(<QuickCreateEventFields {...props} />);

    expect(html).toContain('aria-label="Date: Tuesday, September 15"');
    expect(html).toContain('aria-label="Start time"');
    expect(html).toContain('aria-label="End time"');
    expect(html).toContain('All day');
    expect(html).toContain('Work Calendar');
    expect(html).toContain('value="Room 101"');
    expect(html).toContain('Planning');
    expect(html.indexOf('aria-label="Date:')).toBeLessThan(html.indexOf('Choose calendar'));
    expect(html.indexOf('Choose calendar')).toBeLessThan(html.indexOf('aria-label="Location"'));
    expect(html.indexOf('aria-label="Location"')).toBeLessThan(
      html.indexOf('aria-label="Description"'),
    );
  });

  it('keeps all-day time controls mounted, hidden, and disabled', () => {
    const html = renderToStaticMarkup(<QuickCreateEventFields {...props} allDay />);

    expect(html).toMatch(
      /aria-hidden="true"[^>]*><div[^>]*><button[^>]*aria-label="Start time"[^>]*disabled/,
    );
    expect(html).toMatch(/aria-label="End time"[^>]*disabled/);
    expect(html).toContain('checked');
  });
});
