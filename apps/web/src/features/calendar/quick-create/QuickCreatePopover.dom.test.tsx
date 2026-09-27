// @vitest-environment jsdom
import '../../../test/dom';

import type { Calendar, CalendarEvent } from '@cal/schemas';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { QuickCreatePopover } from './QuickCreatePopover';
import styles from './QuickCreatePopover.module.css';
import type { EventOccurrence } from '../utils/calendar-occurrences';

const { taskLists } = vi.hoisted(() => ({
  taskLists: [
    {
      id: '44444444-4444-4444-4444-444444444441',
      name: 'Errands',
      color: '#4766db',
      position: 0,
      userId: 'u1',
    },
    {
      id: '44444444-4444-4444-4444-444444444442',
      name: 'Personal',
      color: '#61d6a2',
      position: 1,
      userId: 'u1',
    },
  ],
}));

// The same list array on every render, as TanStack Query returns it.
vi.mock('../../tasks/hooks/useTasks', () => ({
  useTaskLists: () => ({ data: taskLists }),
}));

const WORK_ID = '22222222-2222-2222-2222-222222222221';
const HOME_ID = '22222222-2222-2222-2222-222222222222';
const SHARED_ID = '22222222-2222-2222-2222-222222222223';

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
  calendar(WORK_ID, 'Work', { isDefault: true }),
  calendar(HOME_ID, 'Home', { color: '#ff7d84' }),
  calendar(SHARED_ID, 'Shared', { isReadOnly: true }),
];

const standup: CalendarEvent = {
  id: '55555555-5555-5555-5555-555555555555',
  userId: 'u1',
  calendarId: WORK_ID,
  title: 'Team Standup',
  description: 'Daily sync',
  location: 'Room 101',
  color: null,
  allDay: false,
  startAt: '2026-09-15T14:00:00Z',
  endAt: '2026-09-15T15:00:00Z',
  timezone: 'UTC',
  recurrenceRule: null,
  recurringEventId: null,
  recurrenceOriginalStartAt: null,
  status: 'confirmed',
  sourceType: 'internal',
  providerEventId: null,
  providerEtag: null,
  providerUpdatedAt: null,
  syncStatus: 'synced',
  alerts: [],
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

function occurrenceOf(event: CalendarEvent): EventOccurrence {
  return {
    key: `${event.id}-0`,
    calendar: calendars.find((cal) => cal.id === event.calendarId),
    occurrenceIndex: 0,
    start: new Date(event.startAt).getTime(),
    end: new Date(event.endAt).getTime(),
    event,
  } as EventOccurrence;
}

type Props = ComponentProps<typeof QuickCreatePopover>;

function popoverProps(overrides: Partial<Props> = {}): Props {
  return {
    isOpen: true,
    anchorRect: { top: 200, left: 300, right: 450, bottom: 260, width: 150, height: 60 },
    selectedDateKey: '2026-09-15',
    initialStartTime: '10:00',
    initialEndTime: '11:00',
    calendars,
    timeZone: 'UTC',
    defaultDurationMinutes: 60,
    isSaving: false,
    onClose: vi.fn(),
    onClosing: vi.fn(),
    onCreateEvent: vi.fn(async () => {}),
    onUpdateEvent: vi.fn(async () => {}),
    onDeleteEvent: vi.fn(async () => {}),
    onCreateTask: vi.fn(async () => {}),
    onMoreOptions: vi.fn(),
    ...overrides,
  };
}

function renderPopover(overrides: Partial<Props> = {}) {
  const props = popoverProps(overrides);
  const view = render(<QuickCreatePopover {...props} />);
  return {
    ...view,
    props,
    rerenderWith: (next: Partial<Props>) =>
      view.rerender(<QuickCreatePopover {...props} {...next} />),
  };
}

// Untimed tests wait for the real 50 ms autofocus so it cannot steal focus
// from a control the test opens afterwards.
async function renderSettled(overrides: Partial<Props> = {}) {
  const user = userEvent.setup();
  const view = renderPopover(overrides);
  await waitFor(() => expect(titleInput()).toHaveFocus());
  return { ...view, user };
}

function dialog() {
  return screen.getByRole('dialog', { name: /Quick create event or task|Edit event/ });
}

function titleInput() {
  return screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement;
}

function field(name: string) {
  return screen.getByRole('textbox', { name }) as HTMLInputElement;
}

function isClosing() {
  return dialog().classList.contains(styles.popoverClosing ?? '__missing__');
}

describe('QuickCreatePopover autofocus', () => {
  it('focuses the title 50 ms after opening without scrolling', () => {
    vi.useFakeTimers();
    renderPopover();
    const focus = vi.spyOn(titleInput(), 'focus');

    act(() => vi.advanceTimersByTime(49));
    expect(titleInput()).not.toHaveFocus();

    act(() => vi.advanceTimersByTime(1));
    expect(titleInput()).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('cancels the pending autofocus when closed or unmounted first', () => {
    vi.useFakeTimers();
    const { rerenderWith, unmount } = renderPopover();

    rerenderWith({ isOpen: false });
    expect(vi.getTimerCount()).toBe(0);

    rerenderWith({ isOpen: true });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('QuickCreatePopover closing', () => {
  it('animates out from the Close button and finishes on its own animation end', async () => {
    const { user, props } = await renderSettled();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(isClosing()).toBe(true);
    expect(props.onClosing).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();

    // A second request while closing is ignored.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClosing).toHaveBeenCalledTimes(1);

    // Animations of descendants bubble to the dialog but do not finish it.
    fireEvent.animationEnd(titleInput());
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.animationEnd(dialog());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('requests the animated close from a backdrop click', async () => {
    const { user, props } = await renderSettled();
    const backdrop = dialog().previousElementSibling as HTMLElement;

    await user.click(backdrop);

    expect(isClosing()).toBe(true);
    expect(props.onClosing).toHaveBeenCalledTimes(1);
  });

  it('requests the animated close on Escape and keeps it from other window listeners', async () => {
    const { user, props } = await renderSettled();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);

    try {
      await user.keyboard('{Escape}');
    } finally {
      window.removeEventListener('keydown', outer);
    }

    expect(isClosing()).toBe(true);
    expect(props.onClosing).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('ignores the backdrop, Close and Escape while saving', async () => {
    const user = userEvent.setup();
    const { props } = renderPopover({ isSaving: true });
    const backdrop = dialog().previousElementSibling as HTMLElement;

    await user.click(backdrop);
    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(titleInput()).toBeDisabled();
    expect(isClosing()).toBe(false);
    expect(props.onClosing).not.toHaveBeenCalled();
  });

  it('closes immediately, without the exit animation, from Cancel and More options', async () => {
    const { user, props, rerenderWith } = await renderSettled();

    await user.type(titleInput(), 'Lunch');
    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(props.onMoreOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lunch', calendarId: WORK_ID, startTime: '10:00' }),
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);

    rerenderWith({ isOpen: false });
    rerenderWith({ isOpen: true });
    await user.click(screen.getByRole('tab', { name: 'Task' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onClosing).not.toHaveBeenCalled();
  });
});

describe('QuickCreatePopover focus trap and modes', () => {
  it('wraps Tab from the last control to the first and Shift+Tab back', async () => {
    const { user } = await renderSettled();
    const first = screen.getByRole('tab', { name: 'Event' });
    const last = screen.getByRole('button', { name: 'Save' });

    act(() => last.focus());
    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it('skips the hidden time controls of an all-day event', async () => {
    const { user } = await renderSettled({ initialAllDay: true });

    act(() => screen.getByRole('button', { name: /^Date:/ }).focus());
    await user.tab();

    expect(screen.getByRole('checkbox', { name: 'All day' })).toHaveFocus();
  });

  it('keeps focus and the typed title when switching between Event and Task', async () => {
    const { user } = await renderSettled();

    await user.type(titleInput(), 'Plan offsite');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.clear(titleInput());
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the event a title');

    await user.type(titleInput(), 'Plan offsite');
    const taskTab = screen.getByRole('tab', { name: 'Task' });
    await user.click(taskTab);

    expect(taskTab).toHaveFocus();
    expect(taskTab).toHaveAttribute('aria-selected', 'true');
    expect(titleInput()).toHaveValue('Plan offsite');
    expect(titleInput()).toHaveAttribute('placeholder', 'What needs doing?');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Choose task list' })).toBeInTheDocument();
  });
});

describe('QuickCreatePopover submission', () => {
  it('rejects an empty title and returns focus to it', async () => {
    const { user, props } = await renderSettled();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Give the event a title');
    expect(titleInput()).toHaveFocus();
    expect(props.onCreateEvent).not.toHaveBeenCalled();
  });

  it('creates the event on Enter and then closes', async () => {
    const { user, props } = await renderSettled();

    await user.type(titleInput(), '  Lunch  {Enter}');

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Lunch',
        calendarId: WORK_ID,
        startAt: '2026-09-15T10:00:00.000Z',
        endAt: '2026-09-15T11:00:00.000Z',
      }),
    );
    expect(props.onClosing).not.toHaveBeenCalled();
  });

  it('keeps the draft open with the error when saving fails', async () => {
    const { user, props } = await renderSettled({
      onCreateEvent: vi.fn(async () => {
        throw new Error('Calendar is offline');
      }),
    });

    await user.type(titleInput(), 'Lunch');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Calendar is offline');
    expect(titleInput()).toHaveValue('Lunch');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('creates a task in the first list by default', async () => {
    const { user, props } = await renderSettled();

    await user.click(screen.getByRole('tab', { name: 'Task' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('What needs doing?');

    await user.type(titleInput(), 'Buy milk{Enter}');

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Buy milk',
        listId: taskLists[0]?.id,
        priority: 'normal',
        dueAt: '2026-09-15T10:00:00.000Z',
        hasDueTime: true,
      }),
    );
  });
});

describe('QuickCreatePopover delete confirmation', () => {
  const editing = { editingOccurrence: occurrenceOf(standup) };

  it('opens and cancels the confirmation from the delete button', async () => {
    const { user, props } = await renderSettled(editing);
    const deleteButton = screen.getByRole('button', { name: 'Delete event' });

    await user.click(deleteButton);
    expect(deleteButton).toHaveAttribute('aria-expanded', 'true');
    const confirm = screen.getByRole('alertdialog', { name: 'Confirm event deletion' });

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(deleteButton);
    await user.click(deleteButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(props.onDeleteEvent).not.toHaveBeenCalled();
  });

  it('dismisses only the confirmation on the first Escape and closes on the second', async () => {
    const { user, props } = await renderSettled(editing);

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(isClosing()).toBe(false);
    expect(props.onClosing).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(isClosing()).toBe(true);
  });

  it('deletes the event and closes on confirm', async () => {
    const { user, props } = await renderSettled(editing);

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onDeleteEvent).toHaveBeenCalledWith(standup);
    expect(props.onClosing).not.toHaveBeenCalled();
  });

  it('shows a failed delete and stays open', async () => {
    const { user, props } = await renderSettled({
      ...editing,
      onDeleteEvent: vi.fn(async () => {
        throw new Error('Provider rejected the delete');
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider rejected the delete');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('closes the confirmation when a different event is opened', async () => {
    const { user, rerenderWith } = await renderSettled(editing);

    await user.click(screen.getByRole('button', { name: 'Delete event' }));
    rerenderWith({ editingOccurrence: occurrenceOf({ ...standup, id: 'other', title: 'Retro' }) });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(titleInput()).toHaveValue('Retro');
  });

  it('offers no delete for an event on a read-only calendar', async () => {
    await renderSettled({ editingOccurrence: occurrenceOf({ ...standup, calendarId: SHARED_ID }) });

    expect(screen.queryByRole('button', { name: 'Delete event' })).not.toBeInTheDocument();
  });
});

describe('QuickCreatePopover nested pickers', () => {
  it('closes only an open calendar Select on Escape', async () => {
    const { user, props } = await renderSettled();
    const trigger = screen.getByRole('combobox', { name: 'Choose calendar' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox', { name: 'Choose calendar' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(isClosing()).toBe(false);
    expect(props.onClosing).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(isClosing()).toBe(true);
  });

  it('closes only an open date picker on Escape and returns focus to its trigger', async () => {
    const { user, props } = await renderSettled();
    const trigger = screen.getByRole('button', { name: /^Date:/ });

    await user.click(trigger);
    const picker = screen.getByRole('dialog', { name: 'Choose date' });
    await waitFor(() => expect(picker).toContainElement(document.activeElement as HTMLElement));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Choose date' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(isClosing()).toBe(false);
    expect(props.onClosing).not.toHaveBeenCalled();
  });

  it('closes only an open time menu on Escape and returns focus to its trigger', async () => {
    const { user, props } = await renderSettled();
    const trigger = screen.getByRole('button', { name: 'Start time' });

    await user.click(trigger);
    const menu = screen.getByRole('listbox', { name: 'Start time' });
    await waitFor(() => expect(menu).toContainElement(document.activeElement as HTMLElement));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox', { name: 'Start time' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(isClosing()).toBe(false);
    expect(props.onClosing).not.toHaveBeenCalled();
  });

  it('keeps the draft when another calendar is chosen and saves to it', async () => {
    const { user, props } = await renderSettled();

    await user.type(titleInput(), 'Lunch');
    await user.type(field('Location'), 'Cafe');
    await user.type(field('Description'), 'Bring notes');
    await user.click(screen.getByRole('combobox', { name: 'Choose calendar' }));
    await user.click(screen.getByRole('option', { name: 'Home' }));

    expect(screen.getByRole('combobox', { name: 'Choose calendar' })).toHaveTextContent('Home');
    expect(titleInput()).toHaveValue('Lunch');
    expect(field('Location')).toHaveValue('Cafe');
    expect(field('Description')).toHaveValue('Bring notes');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onCreateEvent).toHaveBeenCalledTimes(1));
    expect(props.onCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Lunch', calendarId: HOME_ID, location: 'Cafe' }),
    );
  });

  it('keeps the task title when another list is chosen and saves to it', async () => {
    const { user, props } = await renderSettled();

    await user.click(screen.getByRole('tab', { name: 'Task' }));
    await user.type(titleInput(), 'Buy milk');
    await user.click(screen.getByRole('combobox', { name: 'Choose task list' }));
    await user.click(screen.getByRole('option', { name: 'Personal' }));

    expect(titleInput()).toHaveValue('Buy milk');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onCreateTask).toHaveBeenCalledTimes(1));
    expect(props.onCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Buy milk', listId: taskLists[1]?.id }),
    );
  });

  it('keeps edits and a new calendar when moving an existing event', async () => {
    const { user, props } = await renderSettled({ editingOccurrence: occurrenceOf(standup) });

    await user.clear(titleInput());
    await user.type(titleInput(), 'Standup (moved)');
    await user.click(screen.getByRole('combobox', { name: 'Choose calendar' }));
    await user.click(screen.getByRole('option', { name: 'Home' }));

    expect(screen.getByRole('combobox', { name: 'Choose calendar' })).toHaveTextContent('Home');
    expect(titleInput()).toHaveValue('Standup (moved)');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(props.onUpdateEvent).toHaveBeenCalledTimes(1));
    expect(props.onUpdateEvent).toHaveBeenCalledWith(
      standup,
      expect.objectContaining({ title: 'Standup (moved)', calendarId: HOME_ID }),
    );
  });
});
