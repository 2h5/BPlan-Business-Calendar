// @vitest-environment jsdom
import '../../../test/dom';

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TaskRow } from './TaskRow';
import styles from './TaskRow.module.css';
import type { TaskWithTags } from '../api/tasks.api';

const EXIT_MS = 260;

const openTask: TaskWithTags = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: '11111111-1111-1111-1111-111111111111',
  listId: null,
  title: 'Prepare agenda',
  description: null,
  status: 'open',
  priority: 'normal',
  dueAt: '2026-09-20T16:00:00.000Z',
  hasDueTime: false,
  estimatedMinutes: null,
  scheduledEventId: null,
  isFlexible: true,
  recurrenceRule: null,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tagIds: [],
};

type Props = ComponentProps<typeof TaskRow>;

function rowProps(overrides: Partial<Props> = {}): Props {
  return {
    task: openTask,
    isSelected: false,
    now: new Date('2026-09-27T14:00:00.000Z'),
    timeZone: 'UTC',
    onSelect: vi.fn(),
    onToggleComplete: vi.fn(),
    onSnooze: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

function renderRow(overrides: Partial<Props> = {}) {
  const props = rowProps(overrides);
  const view = render(<TaskRow {...props} />);
  const row = view.container.querySelector('[data-task-row]') as HTMLElement;
  return {
    ...view,
    props,
    row,
    rerenderWith: (next: Partial<Props>) => view.rerender(<TaskRow {...props} {...next} />),
  };
}

// The exit delay is the contract in these tests, so they use fake timers with
// synchronous fireEvent. user-event's async wrapper waits on a real 0 ms
// timeout (Testing Library only auto-advances Jest's fake timers), so
// user-event is used in the untimed menu tests instead.
function renderTimedRow(overrides: Partial<Props> = {}) {
  vi.useFakeTimers();
  return renderRow(overrides);
}

function elapse(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

function click(name: string, role: 'button' | 'menuitem' = 'button') {
  fireEvent.click(screen.getByRole(role, { name }));
}

function actionsButton() {
  return screen.getByRole('button', { name: 'Task actions' });
}

function menu() {
  return screen.queryByRole('menu');
}

describe('TaskRow selection and exit actions', () => {
  it('selects the task from its content without starting an action', async () => {
    const user = userEvent.setup();
    const { props } = renderRow();

    await user.click(screen.getByRole('button', { name: 'Open task: Prepare agenda' }));

    expect(props.onSelect).toHaveBeenCalledWith(openTask);
    expect(props.onToggleComplete).not.toHaveBeenCalled();
  });

  it('shows completion immediately and reports it after the exit delay', () => {
    const { props, row } = renderTimedRow();

    click('Mark complete');

    expect(screen.getByRole('button', { name: 'Mark open' })).toBeInTheDocument();
    expect(row).toHaveClass(styles.rowCompletingExit ?? '__missing__');
    elapse(EXIT_MS - 1);
    expect(props.onToggleComplete).not.toHaveBeenCalled();

    elapse(1);
    expect(props.onToggleComplete).toHaveBeenCalledTimes(1);
    expect(props.onToggleComplete).toHaveBeenCalledWith(openTask, true);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('reopens a completed task after the exit delay', () => {
    const completed = { ...openTask, status: 'completed' as const };
    const { props } = renderTimedRow({ task: completed });

    click('Mark open');
    expect(screen.getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();

    elapse(EXIT_MS);
    expect(props.onToggleComplete).toHaveBeenCalledWith(completed, false);
  });

  it.each([
    ['Snooze until tomorrow', 'onSnooze', styles.rowSnoozingExit],
    ['Delete task', 'onDelete', styles.rowDeletingExit],
  ] as const)('%s closes the menu and reports after the exit delay', (item, callback, exit) => {
    const { props, row } = renderTimedRow();

    fireEvent.click(actionsButton());
    click(item, 'menuitem');

    expect(menu()).not.toBeInTheDocument();
    expect(row).toHaveClass(exit ?? '__missing__');
    elapse(EXIT_MS - 1);
    expect(props[callback]).not.toHaveBeenCalled();

    elapse(1);
    expect(props[callback]).toHaveBeenCalledTimes(1);
    expect(props[callback]).toHaveBeenCalledWith(openTask);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('ignores further actions while one is exiting', () => {
    const { props } = renderTimedRow();

    click('Mark complete');
    click('Mark open');
    fireEvent.click(actionsButton());
    click('Delete task', 'menuitem');
    elapse(EXIT_MS * 2);

    expect(props.onToggleComplete).toHaveBeenCalledTimes(1);
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('drops a pending action when the row unmounts before the delay ends', () => {
    const { props, unmount } = renderTimedRow();

    click('Mark complete');
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    elapse(EXIT_MS);
    expect(props.onToggleComplete).not.toHaveBeenCalled();
  });
});

describe('TaskRow actions menu', () => {
  it('toggles from the actions button without selecting the row', async () => {
    const user = userEvent.setup();
    const { props } = renderRow();

    await user.click(actionsButton());
    expect(menu()).toBeInTheDocument();
    expect(actionsButton()).toHaveAttribute('aria-expanded', 'true');

    await user.click(actionsButton());
    expect(menu()).not.toBeInTheDocument();
    expect(actionsButton()).toHaveAttribute('aria-expanded', 'false');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('stays open for presses inside the menu and closes for presses outside', async () => {
    const user = userEvent.setup();
    const { props } = renderRow();

    await user.click(actionsButton());
    await user.click(menu() as HTMLElement);
    expect(menu()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open task: Prepare agenda' }));
    expect(menu()).not.toBeInTheDocument();
    expect(props.onSelect).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(actionsButton());
    await user.keyboard('{Escape}');

    expect(menu()).not.toBeInTheDocument();
  });

  it('closes when another row opens its menu', async () => {
    const user = userEvent.setup();
    const props = rowProps();
    render(
      <>
        <TaskRow {...props} />
        <TaskRow {...props} task={{ ...openTask, id: 'second', title: 'Second' }} />
      </>,
    );
    const [first, second] = screen.getAllByRole('button', { name: 'Task actions' });

    await user.click(first as HTMLElement);
    await user.click(second as HTMLElement);

    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('TaskRow after an exit action', () => {
  // Snooze moves the due date one day from the task's existing due date and
  // has no optimistic cache update. A task that is still overdue (or still
  // upcoming) afterwards stays in the same section, so this row is not
  // remounted and must not stay in its finished, invisible exit state.
  it('recovers when the snoozed task is updated but stays in place', () => {
    const { props, row, rerenderWith } = renderTimedRow();

    fireEvent.click(actionsButton());
    click('Snooze until tomorrow', 'menuitem');
    elapse(EXIT_MS);
    expect(props.onSnooze).toHaveBeenCalledTimes(1);

    rerenderWith({ task: { ...openTask, dueAt: '2026-09-21T16:00:00.000Z' } });

    expect(row).not.toHaveClass(styles.rowSnoozingExit ?? '__missing__');
    click('Mark complete');
    elapse(EXIT_MS);
    expect(props.onToggleComplete).toHaveBeenCalledTimes(1);
  });

  it('keeps exiting when the task updates before the delay ends', () => {
    const { props, row, rerenderWith } = renderTimedRow();

    click('Mark complete');
    elapse(100);
    rerenderWith({ task: { ...openTask, updatedAt: '2026-09-27T14:00:01.000Z' } });

    expect(row).toHaveClass(styles.rowCompletingExit ?? '__missing__');
    click('Mark open');
    elapse(EXIT_MS);
    expect(props.onToggleComplete).toHaveBeenCalledTimes(1);
  });
});
