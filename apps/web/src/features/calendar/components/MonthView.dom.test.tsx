// @vitest-environment jsdom
import '../../../test/dom';

import type { CalendarEvent } from '@cal/schemas';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MonthView } from './MonthView';
import type { EventOccurrence } from '../hooks/useCalendarWindow';

const DAY = '2026-09-16';
const dateKeys = Array.from({ length: 35 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 7, 31 + index));
  return date.toISOString().slice(0, 10);
});

const standup: EventOccurrence = {
  key: 'standup:0',
  event: { id: 'standup', title: 'Standup', allDay: false } as CalendarEvent,
  calendar: undefined,
  start: Date.parse(`${DAY}T09:00:00.000Z`),
  end: Date.parse(`${DAY}T09:30:00.000Z`),
  occurrenceIndex: 0,
};

function renderMonth() {
  const onSelectDate = vi.fn();
  render(
    <MonthView
      dateKeys={dateKeys}
      byDateKey={new Map([[DAY, [standup]]])}
      selectedDateKey={DAY}
      timeZone="UTC"
      now={new Date(`${DAY}T12:00:00.000Z`)}
      onSelectDate={onSelectDate}
      onSelectEvent={vi.fn()}
      onSelectSlot={vi.fn()}
    />,
  );
  const cell = document.querySelector<HTMLElement>(`[data-date-key="${DAY}"]`);
  if (!cell) throw new Error('day cell missing');
  return { onSelectDate, cell, event: screen.getByRole('button', { name: 'Standup' }) };
}

describe('MonthView day zoom', () => {
  it('opens the day on a double-click in empty space', () => {
    const { onSelectDate, cell } = renderMonth();

    fireEvent.click(cell);
    fireEvent.click(cell);
    fireEvent.doubleClick(cell);

    expect(onSelectDate).toHaveBeenCalledWith(DAY);
  });

  it('stays put when the first click landed on an event', () => {
    const { onSelectDate, cell, event } = renderMonth();

    fireEvent.click(event);
    fireEvent.click(cell);
    fireEvent.doubleClick(cell);

    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('stays put on a double-click on an event', () => {
    const { onSelectDate, event } = renderMonth();

    fireEvent.click(event);
    fireEvent.click(event);
    fireEvent.doubleClick(event);

    expect(onSelectDate).not.toHaveBeenCalled();
  });
});
