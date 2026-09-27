import type { TaskList } from '@cal/schemas';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TodayTaskRow } from './TodayTaskRow';
import styles from './TodayView.module.css';
import type { TaskWithTags } from '../../tasks/api/tasks.api';

const now = new Date('2026-09-27T14:00:00.000Z');
const list: TaskList = {
  id: '22222222-2222-2222-2222-222222222222',
  userId: '11111111-1111-1111-1111-111111111111',
  name: 'Work',
  color: '#123456',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const task: TaskWithTags = {
  id: '33333333-3333-3333-3333-333333333333',
  userId: list.userId,
  listId: list.id,
  title: 'Prepare agenda',
  description: null,
  status: 'open',
  priority: 'high',
  dueAt: '2026-09-27T20:00:00.000Z',
  hasDueTime: true,
  estimatedMinutes: 90,
  scheduledEventId: null,
  isFlexible: true,
  recurrenceRule: null,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tagIds: [],
};

function props(overrides: Partial<Parameters<typeof TodayTaskRow>[0]> = {}) {
  return {
    task,
    lists: [list],
    now,
    timeZone: 'America/New_York',
    hourCycle: 'h12' as const,
    onOpen: vi.fn(),
    onToggle: vi.fn(),
    onSnooze: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

interface ButtonProps {
  children?: ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
  title?: string;
}

function findButton(node: ReactNode, label: string): ReactElement<ButtonProps> | undefined {
  if (!isValidElement<ButtonProps>(node)) return undefined;
  if (
    node.type === 'button' &&
    (node.props['aria-label'] === label || node.props.title === label)
  ) {
    return node;
  }
  for (const child of Children.toArray(node.props.children)) {
    const match = findButton(child, label);
    if (match) return match;
  }
  return undefined;
}

describe('TodayTaskRow', () => {
  it('renders the list, priority, due time, duration, and task-open control', () => {
    const input = props();
    const html = renderToStaticMarkup(<TodayTaskRow {...input} />);

    expect(html).toContain(`class="${styles.taskRow} "`);
    expect(html).toContain('aria-label="Complete: Prepare agenda"');
    expect(html).toContain('aria-label="Open task details: Prepare agenda"');
    expect(html).toContain(`class="${styles.listPill}"`);
    expect(html).toContain(`class="${styles.listPillDot}" style="background-color:#123456"`);
    expect(html).toContain('Work');
    expect(html).toContain(`${styles.priorityPill} ${styles.priorityHigh}`);
    expect(html).toContain('>High</span>');
    expect(html).toContain(`${styles.duePill} ${styles.dueToday}`);
    expect(html).toContain('>Today, 4:00 PM</span>');
    expect(html).toContain(`class="${styles.durationPill}">⏱ 1h 30m</span>`);

    findButton(TodayTaskRow(input), 'Open task details: Prepare agenda')?.props.onClick?.();
    expect(input.onOpen).toHaveBeenCalledWith(task.id);
  });

  it('labels a completed task for reopening and suppresses its due pill', () => {
    const completed = { ...task, status: 'completed' as const };
    const input = props({ task: completed });
    const html = renderToStaticMarkup(<TodayTaskRow {...input} />);

    expect(html).toContain(`${styles.taskRow} ${styles.taskRowCompleted}`);
    expect(html).toContain(`${styles.taskCheckbox} ${styles.taskCheckboxChecked}`);
    expect(html).toContain('aria-label="Mark incomplete: Prepare agenda"');
    expect(html).not.toContain(`class="${styles.duePill}`);

    findButton(TodayTaskRow(input), 'Mark incomplete: Prepare agenda')?.props.onClick?.();
    expect(input.onToggle).toHaveBeenCalledWith(completed, false);
  });

  it('keeps the open checkbox and overdue tone, without absent list or normal priority pills', () => {
    const overdue = {
      ...task,
      listId: null,
      priority: 'normal' as const,
      dueAt: '2026-09-26T20:00:00.000Z',
    };
    const input = props({ task: overdue });
    const html = renderToStaticMarkup(<TodayTaskRow {...input} />);

    expect(html).toContain('aria-label="Complete: Prepare agenda"');
    expect(html).toContain(`${styles.duePill} ${styles.dueOverdue}`);
    expect(html).toContain('>Yesterday, 4:00 PM</span>');
    expect(html).not.toContain(`class="${styles.listPill}"`);
    expect(html).not.toContain(`class="${styles.priorityPill}`);

    findButton(TodayTaskRow(input), 'Complete: Prepare agenda')?.props.onClick?.();
    expect(input.onToggle).toHaveBeenCalledWith(overdue, true);
  });

  it('forwards snooze and delete through their titled action buttons', () => {
    const input = props();
    const view = TodayTaskRow(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain('title="Snooze to tomorrow"');
    expect(html).toContain('title="Delete task"');
    expect(html).toContain(`${styles.taskActionBtn} ${styles.taskActionBtnDanger}`);
    findButton(view, 'Snooze to tomorrow')?.props.onClick?.();
    findButton(view, 'Delete task')?.props.onClick?.();
    expect(input.onSnooze).toHaveBeenCalledWith(task);
    expect(input.onDelete).toHaveBeenCalledWith(task);
  });
});
