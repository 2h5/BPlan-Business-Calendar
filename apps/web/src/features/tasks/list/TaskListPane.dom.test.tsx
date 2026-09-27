// @vitest-environment jsdom
import '../../../test/dom';

import type { TaskList } from '@cal/schemas';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TaskListPane } from './TaskListPane';
import type { TaskWithTags } from '../api/tasks.api';
import type { TaskFilter, WebTaskBuckets } from '../hooks/useTaskBuckets';

const list: TaskList = {
  id: '22222222-2222-2222-2222-222222222222',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Work',
  color: '#123456',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const baseTask: TaskWithTags = {
  id: '33333333-3333-3333-3333-333333333331',
  userId: list.userId,
  listId: null,
  title: 'Due today task',
  description: null,
  status: 'open',
  priority: 'normal',
  dueAt: '2026-09-27T16:00:00.000Z',
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

const dueToday = baseTask;
const doneToday: TaskWithTags = {
  ...baseTask,
  id: '33333333-3333-3333-3333-333333333332',
  title: 'Finished task',
  status: 'completed',
  completedAt: '2026-09-27T12:00:00.000Z',
};

const buckets: WebTaskBuckets = {
  overdue: [],
  dueToday: [dueToday],
  scheduled: [],
  unscheduled: [],
  completedToday: [doneToday],
  upcoming: [],
  someday: [],
  allCompleted: [doneToday],
};

type Props = ComponentProps<typeof TaskListPane>;

function paneProps(overrides: Partial<Props> = {}): Props {
  return {
    buckets,
    allTasks: [dueToday, doneToday],
    lists: [list],
    selectedTaskId: null,
    selectedListId: null,
    activeTab: 'inbox',
    isLoading: false,
    isError: false,
    now: new Date('2026-09-27T14:00:00.000Z'),
    timeZone: 'UTC',
    onTabChange: vi.fn(),
    onListChange: vi.fn(),
    onSelectTask: vi.fn(),
    onToggleComplete: vi.fn(),
    onSnooze: vi.fn(),
    onDelete: vi.fn(),
    onQuickAdd: vi.fn().mockResolvedValue(undefined),
    onNewTaskClick: vi.fn(),
    onRetry: vi.fn(),
    onEmptySpaceClick: vi.fn(),
    ...overrides,
  };
}

// Owns the active tab like TasksView does, so real tab clicks drive the pane.
function PaneWithTabs(props: Props) {
  const [activeTab, setActiveTab] = useState<TaskFilter>(props.activeTab);
  return (
    <TaskListPane
      {...props}
      activeTab={activeTab}
      onTabChange={(tab) => {
        props.onTabChange(tab);
        setActiveTab(tab);
      }}
    />
  );
}

function renderPane(overrides: Partial<Props> = {}) {
  const props = paneProps(overrides);
  const user = userEvent.setup();
  const view = render(<PaneWithTabs {...props} />);
  return { ...view, props, user };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function quickAddInput() {
  return screen.getByPlaceholderText('Add task to inbox... Press Enter');
}

function section(title: string) {
  return screen.getByText(title, { selector: 'span' }).closest('section') as HTMLElement;
}

function row(title: string) {
  return screen
    .getByRole('button', { name: `Open task: ${title}` })
    .closest('[data-task-row]') as HTMLElement;
}

describe('TaskListPane quick add', () => {
  it('submits the trimmed title on Enter and shows pending, then clears on success', async () => {
    const pending = deferred();
    const onQuickAdd = vi.fn(() => pending.promise);
    const { user } = renderPane({ onQuickAdd });

    await user.type(quickAddInput(), '  Draft agenda  {Enter}');

    expect(onQuickAdd).toHaveBeenCalledTimes(1);
    expect(onQuickAdd).toHaveBeenCalledWith('Draft agenda');
    expect(quickAddInput()).toBeDisabled();
    expect(quickAddInput()).toHaveValue('  Draft agenda  ');
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();

    await act(async () => pending.resolve());

    expect(quickAddInput()).toBeEnabled();
    expect(quickAddInput()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('submits from the Add button', async () => {
    const { user, props } = renderPane();

    await user.type(quickAddInput(), 'Call supplier');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(props.onQuickAdd).toHaveBeenCalledWith('Call supplier');
  });

  it('does not submit a blank title', async () => {
    const { user, props } = renderPane();

    await user.type(quickAddInput(), '   {Enter}');

    expect(props.onQuickAdd).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(quickAddInput()).toHaveValue('   ');
  });

  it('keeps the title and shows an accessible error when adding fails, then clears it on retry', async () => {
    const first = deferred();
    const onQuickAdd = vi.fn(() => first.promise);
    const { user } = renderPane({ onQuickAdd });

    await user.type(quickAddInput(), 'Draft agenda{Enter}');
    await act(async () => first.reject(new Error('Network down')));

    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
    expect(quickAddInput()).toBeEnabled();
    expect(quickAddInput()).toHaveValue('Draft agenda');
    expect(quickAddInput()).toHaveAttribute('aria-invalid', 'true');
    expect(quickAddInput()).toHaveAttribute('aria-describedby', 'quick-add-error');

    const second = deferred();
    onQuickAdd.mockImplementation(() => second.promise);
    await user.type(quickAddInput(), '{Enter}');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(quickAddInput()).toHaveAttribute('aria-invalid', 'false');
    expect(quickAddInput()).not.toHaveAttribute('aria-describedby');

    await act(async () => second.resolve());
    expect(quickAddInput()).toHaveValue('');
  });

  it('uses the fallback message for a non-Error failure', async () => {
    const { user } = renderPane({ onQuickAdd: vi.fn().mockRejectedValue('nope') });

    await user.type(quickAddInput(), 'Draft agenda{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add the task. Try again.',
    );
  });
});

describe('TaskListPane empty-space clicks', () => {
  it('reports clicks on non-interactive pane areas', async () => {
    const { user, props } = renderPane();

    await user.click(screen.getByRole('heading', { name: 'Tasks' }));
    await user.click(screen.getByText('Due Today', { selector: 'span' }));
    await user.click(screen.getByText('All caught up?'));

    expect(props.onEmptySpaceClick).toHaveBeenCalledTimes(3);
  });

  it('ignores clicks on rows, row actions, and controls', async () => {
    const { user, props } = renderPane();

    await user.click(screen.getByText('Due today task'));
    await user.click(within(row('Due today task')).getByRole('button', { name: 'Task actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Snooze until tomorrow' }));
    await user.click(screen.getByRole('button', { name: /^All/ }));
    await user.click(quickAddInput());
    await user.click(screen.getByRole('combobox', { name: 'Filter by list' }));
    await user.click(screen.getByRole('listbox', { name: 'Filter by list' }));
    await user.click(screen.getByRole('option', { name: 'Work' }));
    await user.click(screen.getByRole('button', { name: 'Create a new task' }));

    expect(props.onEmptySpaceClick).not.toHaveBeenCalled();
    expect(props.onSelectTask).toHaveBeenCalledTimes(1);
    expect(props.onListChange).toHaveBeenCalledWith(list.id);
    expect(props.onNewTaskClick).toHaveBeenCalledTimes(1);
  });

  it('does not select a row from its checkbox or actions', async () => {
    const { user, props } = renderPane();
    const dueRow = row('Due today task');

    await user.click(within(dueRow).getByRole('button', { name: 'Task actions' }));
    await user.click(within(dueRow).getByRole('button', { name: 'Mark complete' }));

    expect(props.onSelectTask).not.toHaveBeenCalled();
    expect(props.onEmptySpaceClick).not.toHaveBeenCalled();
  });

  it('treats Retry as a control and tolerates a missing empty-space handler', async () => {
    const { user, props } = renderPane({ isError: true, onEmptySpaceClick: undefined });

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await user.click(screen.getByText('Failed to load tasks.'));

    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('TaskListPane tabs and section identity', () => {
  it('reports tab changes and marks the pressed tab', async () => {
    const { user, props } = renderPane();

    await user.click(screen.getByRole('button', { name: /^All/ }));

    expect(props.onTabChange).toHaveBeenCalledWith('all');
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^Inbox/ })).toHaveAttribute('aria-pressed', 'false');
  });

  // TaskListSection keys its returned <section> by title on purpose. Inbox
  // ends with "Completed Today" and All ends with "Completed" in the same
  // position, so switching remounts that section and its rows while sections
  // whose title is unchanged keep their DOM and row state.
  it('remounts the completed section between Inbox and All but keeps other sections', async () => {
    const { user } = renderPane();
    const dueSection = section('Due Today');
    const dueRow = row('Due today task');
    const completedTodaySection = section('Completed Today');
    const completedRow = row('Finished task');

    await user.click(screen.getByRole('button', { name: /^All/ }));

    expect(section('Due Today')).toBe(dueSection);
    expect(row('Due today task')).toBe(dueRow);
    expect(screen.queryByText('Completed Today')).not.toBeInTheDocument();
    expect(completedTodaySection).not.toBeInTheDocument();
    expect(completedRow).not.toBeInTheDocument();
    expect(row('Finished task')).not.toBe(completedRow);

    const completedSection = section('Completed');
    const allCompletedRow = row('Finished task');
    await user.click(screen.getByRole('button', { name: /^Inbox/ }));

    expect(section('Due Today')).toBe(dueSection);
    expect(completedSection).not.toBeInTheDocument();
    expect(allCompletedRow).not.toBeInTheDocument();
    expect(section('Completed Today')).toBeInTheDocument();
  });

  // A tab click is itself an outside press that closes any row menu, so these
  // switch tabs through the prop to observe row state across the change.
  it.each([
    ['keeps', 'Due today task', 'true'],
    ['resets', 'Finished task', 'false'],
  ])('%s row state for %s when switching Inbox to All', async (_, title, expanded) => {
    const user = userEvent.setup();
    const props = paneProps();
    const { rerender } = render(<TaskListPane {...props} />);

    await user.click(within(row(title)).getByRole('button', { name: 'Task actions' }));
    rerender(<TaskListPane {...props} activeTab="all" />);

    expect(within(row(title)).getByRole('button', { name: 'Task actions' })).toHaveAttribute(
      'aria-expanded',
      expanded,
    );
  });

  it('shows only completed tasks in Done and the empty state when there are none', async () => {
    const { user, rerender, props } = renderPane();

    await user.click(screen.getByRole('button', { name: /^Done/ }));

    expect(section('Completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open task: Due today task' })).toBeNull();
    expect(screen.queryByText('All caught up?')).not.toBeInTheDocument();

    rerender(
      <TaskListPane
        {...props}
        activeTab="completed"
        buckets={{ ...buckets, completedToday: [], allCompleted: [] }}
        allTasks={[dueToday]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No completed tasks' })).toBeInTheDocument();
  });
});
