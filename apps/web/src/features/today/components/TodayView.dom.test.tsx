// @vitest-environment jsdom
import '../../../test/dom';

import type { TaskList } from '@cal/schemas';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TodayView } from './TodayView';
import styles from './TodayView.module.css';
import type { TaskWithTags } from '../../tasks/api/tasks.api';
import type { useToday } from '../hooks/useToday';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  createTask: vi.fn(),
  toggle: vi.fn(),
  snooze: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../../tasks/hooks/useTasks', () => ({
  useCreateTask: () => ({ mutateAsync: mocks.createTask }),
  useToggleTaskComplete: () => ({ mutate: mocks.toggle }),
  useSnoozeTask: () => ({ mutate: mocks.snooze }),
  useDeleteTask: () => ({ mutate: mocks.deleteTask }),
}));
// Panels with their own data and tests; the task column is the subject here.
vi.mock('../../scheduling', () => ({ FindTimeBox: () => null }));
vi.mock('../search/TodaySearch', () => ({ TodaySearch: () => null }));
vi.mock('../glance/DayGlanceCard', () => ({ DayGlanceCard: () => null }));
vi.mock('./TodayScheduleSection', () => ({ TodayScheduleSection: () => null }));

type Today = ReturnType<typeof useToday>;
let today: Today;
vi.mock('../hooks/useToday', () => ({ useToday: () => today }));

const LIST_ID = '66666666-6666-6666-6666-666666666666';
const lists: TaskList[] = [
  { id: LIST_ID, userId: 'u1', name: 'Work', color: '#4766db', position: 0 } as TaskList,
];

function task(id: string, title: string, extra: Partial<TaskWithTags> = {}): TaskWithTags {
  return {
    id,
    userId: 'u1',
    listId: null,
    title,
    description: null,
    status: 'open',
    priority: 'normal',
    dueAt: '2026-09-27T22:00:00.000Z',
    hasDueTime: false,
    estimatedMinutes: null,
    scheduledEventId: null,
    isFlexible: true,
    recurrenceRule: null,
    completedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    tagIds: [],
    ...extra,
  };
}

const overdueTask = task('t-overdue', 'File expenses', { dueAt: '2026-09-24T22:00:00.000Z' });
const dueTask = task('t-due', 'Call the bank');

function todayState(overrides: Partial<Today> = {}): Today {
  return {
    // 10:00 in New York
    now: new Date('2026-09-27T14:00:00.000Z'),
    todayKey: '2026-09-27',
    timeZone: 'America/New_York',
    hourCycle: 'h12',
    profile: undefined,
    lists,
    allDay: [],
    timed: [],
    overdue: [overdueTask],
    dueToday: [dueTask],
    unscheduled: [],
    completedToday: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  } as Today;
}

function renderToday(overrides: Partial<Today> = {}) {
  today = todayState(overrides);
  const user = userEvent.setup();
  const view = render(<TodayView />);
  return { ...view, user };
}

function quickAddInput() {
  return screen.getByPlaceholderText('What needs doing today? (Press Enter to add)');
}

function accordion() {
  return quickAddInput().closest(`.${styles.quickAddAccordion}`) as HTMLElement;
}

function isOpen() {
  return accordion().classList.contains(styles.quickAddAccordionOpen ?? '__missing__');
}

function isFullyOpen() {
  return (accordion().firstElementChild as HTMLElement).classList.contains(
    styles.quickAddAccordionInnerOpen ?? '__missing__',
  );
}

// jsdom has no TransitionEvent, so fireEvent.transitionEnd would drop the
// property name that TodayView filters on.
function transitionEnd(element: Element, propertyName: string) {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  fireEvent(element, event);
}

async function openQuickAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '+ Quick Add' }));
  await waitFor(() => expect(quickAddInput()).toHaveFocus());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TodayView quick add', () => {
  it('opens and focuses the title on the next frame without scrolling', async () => {
    const { user } = renderToday();
    const focus = vi.spyOn(quickAddInput(), 'focus');
    expect(isOpen()).toBe(false);

    await openQuickAdd(user);

    expect(isOpen()).toBe(true);
    expect(isFullyOpen()).toBe(false);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('opens from the empty state as well', async () => {
    const { user } = renderToday({ overdue: [], dueToday: [] });

    await user.click(screen.getByRole('button', { name: '+ Add a Task' }));

    await waitFor(() => expect(quickAddInput()).toHaveFocus());
    expect(isOpen()).toBe(true);
  });

  it('becomes fully open only when its own row transition ends while open', async () => {
    const { user } = renderToday();
    await openQuickAdd(user);
    const inner = accordion().firstElementChild as HTMLElement;

    transitionEnd(inner, 'grid-template-rows');
    transitionEnd(accordion(), 'opacity');
    expect(isFullyOpen()).toBe(false);

    transitionEnd(accordion(), 'grid-template-rows');
    expect(isFullyOpen()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(isFullyOpen()).toBe(false);
    transitionEnd(accordion(), 'grid-template-rows');
    expect(isOpen()).toBe(false);
    expect(isFullyOpen()).toBe(false);
  });

  it('cancels on Escape or Cancel and clears the title', async () => {
    const { user } = renderToday();
    await openQuickAdd(user);

    await user.type(quickAddInput(), 'Draft{Escape}');
    expect(isOpen()).toBe(false);
    expect(quickAddInput()).toHaveValue('');

    await openQuickAdd(user);
    await user.type(quickAddInput(), 'Draft');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(isOpen()).toBe(false);
    expect(quickAddInput()).toHaveValue('');
  });

  it('closes only an open priority Select on Escape', async () => {
    const { user } = renderToday();
    await openQuickAdd(user);
    await user.type(quickAddInput(), 'Draft');
    const priority = screen.getByRole('combobox', { name: 'Task priority' });

    await user.click(priority);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('listbox', { name: 'Task priority' })).not.toBeInTheDocument();
    expect(priority).toHaveFocus();
    expect(isOpen()).toBe(true);
    expect(quickAddInput()).toHaveValue('Draft');
  });

  it('adds a task due at 18:00 today, then closes and resets its choices', async () => {
    let finish: () => void = () => {};
    mocks.createTask.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)));
    const { user } = renderToday();
    await openQuickAdd(user);
    expect(screen.getByRole('button', { name: 'Add Task' })).toBeDisabled();

    await user.type(quickAddInput(), '  Book flights  ');
    await user.click(screen.getByRole('combobox', { name: 'Task list' }));
    await user.click(screen.getByRole('option', { name: 'Work' }));
    await user.click(screen.getByRole('combobox', { name: 'Task priority' }));
    await user.click(screen.getByRole('option', { name: 'Urgent' }));
    await user.click(screen.getByRole('button', { name: 'Add Task' }));

    expect(mocks.createTask).toHaveBeenCalledTimes(1);
    expect(mocks.createTask).toHaveBeenCalledWith({
      title: 'Book flights',
      listId: LIST_ID,
      priority: 'urgent',
      dueAt: '2026-09-27T22:00:00.000Z',
      hasDueTime: false,
      isFlexible: true,
      tagIds: [],
    });
    expect(quickAddInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    finish();
    await waitFor(() => expect(isOpen()).toBe(false));
    expect(quickAddInput()).toBeEnabled();
    expect(quickAddInput()).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Task list' })).toHaveTextContent('Inbox');
    expect(screen.getByRole('combobox', { name: 'Task priority' })).toHaveTextContent(
      'Normal Priority',
    );
  });

  it('stays open with the title after a failed add, without showing an error', async () => {
    mocks.createTask.mockRejectedValue(new Error('offline'));
    const { user } = renderToday();
    await openQuickAdd(user);

    await user.type(quickAddInput(), 'Book flights{Enter}');

    await waitFor(() => expect(quickAddInput()).toBeEnabled());
    expect(isOpen()).toBe(true);
    expect(quickAddInput()).toHaveValue('Book flights');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not submit a blank title', async () => {
    const { user } = renderToday();
    await openQuickAdd(user);

    await user.type(quickAddInput(), '   {Enter}');

    expect(mocks.createTask).not.toHaveBeenCalled();
    expect(isOpen()).toBe(true);
  });
});

describe('TodayView task rows', () => {
  it('completes, opens, snoozes and deletes immediately through the task hooks', async () => {
    const { user } = renderToday();

    await user.click(screen.getByRole('button', { name: 'Complete: Call the bank' }));
    expect(mocks.toggle).toHaveBeenCalledWith({ id: 't-due', completed: true });

    await user.click(screen.getByRole('button', { name: 'Open task details: Call the bank' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/tasks?task=t-due');

    const overdueRow = screen
      .getByRole('button', { name: 'Complete: File expenses' })
      .closest(`.${styles.taskRow}`) as HTMLElement;
    await user.click(overdueRow.querySelector('[title="Snooze to tomorrow"]') as HTMLElement);
    // One day after the old due date (still overdue), at noon for an all-day task.
    expect(mocks.snooze).toHaveBeenCalledWith({
      id: 't-overdue',
      dueAt: new Date('2026-09-25T16:00:00.000Z'),
      hasDueTime: false,
    });

    await user.click(overdueRow.querySelector('[title="Delete task"]') as HTMLElement);
    expect(mocks.deleteTask).toHaveBeenCalledWith('t-overdue');
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('keeps a timed task at its time when snoozed', async () => {
    const timed = task('t-timed', 'Standup prep', {
      dueAt: '2026-09-27T13:30:00.000Z',
      hasDueTime: true,
    });
    const { user } = renderToday({ overdue: [timed], dueToday: [] });

    await user.click(screen.getByTitle('Snooze to tomorrow'));

    expect(mocks.snooze).toHaveBeenCalledWith({
      id: 't-timed',
      dueAt: new Date('2026-09-28T13:30:00.000Z'),
      hasDueTime: true,
    });
  });

  it('toggles the completed-today list and reopens a completed task', async () => {
    const done = task('t-done', 'Send invoice', {
      status: 'completed',
      completedAt: '2026-09-27T13:00:00.000Z',
    });
    const { user } = renderToday({ completedToday: [done] });
    const summary = screen.getByRole('button', { name: /Completed today/ });

    expect(summary).toHaveAttribute('aria-expanded', 'false');
    await user.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Mark incomplete: Send invoice' }));
    expect(mocks.toggle).toHaveBeenCalledWith({ id: 't-done', completed: false });
  });
});
