// @vitest-environment jsdom
import '../../../test/dom';

import type { Calendar } from '@cal/schemas';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CalendarToolbar } from './CalendarToolbar';
import styles from './CalendarView.module.css';

function calendar(id: string, name: string, extra: Partial<Calendar> = {}): Calendar {
  return {
    id,
    userId: 'u1',
    name,
    color: '#4766db',
    isVisible: true,
    isDefault: false,
    isReadOnly: false,
    sourceType: 'internal',
    providerAccountId: null,
    providerCalendarId: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...extra,
  };
}

const calendars = [
  calendar('cal-work', 'Work', { isDefault: true }),
  calendar('cal-holidays', 'Holidays', { isVisible: false, isReadOnly: true }),
];

type Props = ComponentProps<typeof CalendarToolbar>;

function renderToolbar(overrides: Partial<Props> = {}) {
  const props: Props = {
    mode: 'week',
    heading: 'September 2026',
    isFetching: false,
    calendars,
    timeZone: 'America/New_York',
    onToggleVisibility: vi.fn(),
    onCreateCalendar: vi.fn(),
    onEditCalendar: vi.fn(),
    onModeChange: vi.fn(),
    onPrevious: vi.fn(),
    onToday: vi.fn(),
    onNext: vi.fn(),
    onCreateEvent: vi.fn(),
    ...overrides,
  };
  const view = render(<CalendarToolbar {...props} />);
  return { ...view, props };
}

function trigger() {
  return screen.getByRole('button', { name: 'Filter calendars' });
}

function dropdown() {
  return screen.queryByRole('dialog', { name: 'My calendars' });
}

function isClosing() {
  return dropdown()?.classList.contains(styles.calendarsDropdownClosing ?? '__missing__') ?? false;
}

// The 150 ms close fallback is the contract here, so these use fake timers
// with synchronous fireEvent.
function openTimed(overrides: Partial<Props> = {}) {
  vi.useFakeTimers();
  const view = renderToolbar(overrides);
  fireEvent.click(trigger());
  return view;
}

function elapse(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

describe('CalendarToolbar calendars menu', () => {
  it('opens with the visible count, calendar rows and time zone', async () => {
    const user = userEvent.setup();
    renderToolbar();

    expect(trigger()).toHaveTextContent('1/2');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    const menu = dropdown() as HTMLElement;
    expect(within(menu).getByRole('button', { name: 'Hide Work' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(menu).getByRole('button', { name: 'Show Holidays' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(menu).toHaveTextContent('Default · BPlan');
    expect(menu).toHaveTextContent('BPlan · Read only');
    expect(menu).toHaveTextContent('America/New York');
  });

  it('closes over 150 ms, or sooner on its own animation end', () => {
    openTimed();

    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(isClosing()).toBe(true);
    elapse(149);
    expect(dropdown()).toBeInTheDocument();
    elapse(1);
    expect(dropdown()).not.toBeInTheDocument();

    fireEvent.click(trigger());
    fireEvent.click(trigger());
    fireEvent.animationEnd(within(dropdown() as HTMLElement).getByText('Work'));
    expect(dropdown()).toBeInTheDocument();
    fireEvent.animationEnd(dropdown() as HTMLElement);
    expect(dropdown()).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stays open for presses inside and closes for presses outside or Escape', () => {
    openTimed();

    fireEvent.pointerDown(dropdown() as HTMLElement);
    expect(isClosing()).toBe(false);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Today' }));
    expect(isClosing()).toBe(true);
    elapse(150);

    fireEvent.click(trigger());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(isClosing()).toBe(true);
    elapse(150);
    expect(dropdown()).not.toBeInTheDocument();
  });

  it('ignores the trigger while the menu is already closing', () => {
    openTimed();

    fireEvent.click(trigger());
    fireEvent.click(trigger());

    expect(isClosing()).toBe(true);
    elapse(150);
    expect(dropdown()).not.toBeInTheDocument();
  });

  it('keeps the menu open while toggling visibility', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar();

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Show Holidays' }));

    expect(props.onToggleVisibility).toHaveBeenCalledWith(calendars[1]);
    expect(isClosing()).toBe(false);
  });

  it('closes when creating or editing a calendar', () => {
    const { props } = openTimed();

    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));
    expect(props.onCreateCalendar).toHaveBeenCalledTimes(1);
    expect(isClosing()).toBe(true);
    elapse(150);

    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Edit Holidays' }));
    expect(props.onEditCalendar).toHaveBeenCalledWith(calendars[1]);
    expect(isClosing()).toBe(true);
  });

  it('shows an empty state without calendars', async () => {
    const user = userEvent.setup();
    renderToolbar({ calendars: [] });

    expect(trigger()).toHaveTextContent('0/0');
    await user.click(trigger());
    expect(dropdown()).toHaveTextContent('No calendars are available yet.');
  });
});

describe('CalendarToolbar navigation and views', () => {
  it('names navigation after the current view and reports each control', async () => {
    const user = userEvent.setup();
    const { props } = renderToolbar({ mode: 'month' });

    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'New event' }));

    expect(props.onPrevious).toHaveBeenCalledTimes(1);
    expect(props.onToday).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onCreateEvent).toHaveBeenCalledTimes(1);
  });

  it('marks the current view and reports view changes', async () => {
    const user = userEvent.setup();
    const { props, rerender } = renderToolbar();

    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Day' }));
    expect(props.onModeChange).toHaveBeenCalledWith('day');

    rerender(<CalendarToolbar {...props} mode="day" isFetching />);
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeInTheDocument();
    expect(screen.getByLabelText('Refreshing calendar')).toBeInTheDocument();
  });
});
