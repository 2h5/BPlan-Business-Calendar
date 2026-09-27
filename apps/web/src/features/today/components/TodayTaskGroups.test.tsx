import type { TaskList } from '@cal/schemas';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TodayTaskGroups, type TodayTaskGroupsProps } from './TodayTaskGroups';
import { TodayTaskRow } from './TodayTaskRow';
import styles from './TodayView.module.css';
import type { TaskWithTags } from '../../tasks/api/tasks.api';

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
  priority: 'normal',
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

function makeTask(id: string, title: string, status: TaskWithTags['status'] = 'open') {
  return { ...task, id, title, status };
}

function props(overrides: Partial<TodayTaskGroupsProps> = {}): TodayTaskGroupsProps {
  return {
    overdue: [],
    dueToday: [],
    unscheduled: [],
    completedToday: [],
    lists: [list],
    now: new Date('2026-09-27T14:00:00.000Z'),
    timeZone: 'America/New_York',
    hourCycle: 'h12',
    relevantCount: 0,
    isCompletedOpen: false,
    onToggleCompleted: vi.fn(),
    onAddTask: vi.fn(),
    onOpenTask: vi.fn(),
    onToggleTask: vi.fn(),
    onSnoozeTask: vi.fn(),
    onDeleteTask: vi.fn(),
    ...overrides,
  };
}

function elementsOfType<P>(node: ReactNode, type: ReactElement<P>['type']): ReactElement<P>[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const children = Children.toArray(node.props.children).flatMap((child) =>
    elementsOfType<P>(child, type),
  );
  return node.type === type ? [node as ReactElement<P>, ...children] : children;
}

describe('TodayTaskGroups', () => {
  it('shows the empty state and forwards Add a Task', () => {
    const input = props();
    const view = TodayTaskGroups(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain(`class="${styles.emptyTasks}"`);
    expect(html).toContain('No tasks for today');
    expect(html).toContain('You have no overdue items or tasks due today.');
    expect(html).toContain('+ Add a Task');
    expect(html).not.toContain(`class="${styles.taskGroupsList}"`);

    const addButton = elementsOfType<{ onClick: () => void; children: ReactNode }>(
      view,
      'button',
    ).find((button) => button.props.children === '+ Add a Task');
    addButton?.props.onClick();
    expect(input.onAddTask).toHaveBeenCalledOnce();
  });

  it('keeps group headers, badges, group order, and supplied row order', () => {
    const input = props({
      overdue: [makeTask('over-2', 'Overdue second'), makeTask('over-1', 'Overdue first')],
      dueToday: [makeTask('due-1', 'Due item')],
      unscheduled: [makeTask('flex-1', 'Flexible item')],
      relevantCount: 4,
    });
    const view = TodayTaskGroups(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain(`class="${styles.taskSectionHeaderOverdue}"`);
    expect(html).toContain(`class="${styles.taskSectionBadgeOverdue}">2</span>`);
    expect(html).toContain(`class="${styles.taskSectionBadge}">1</span>`);
    expect(html.indexOf('Overdue second')).toBeLessThan(html.indexOf('Overdue first'));
    expect(html.indexOf('Overdue first')).toBeLessThan(html.indexOf('Due Today'));
    expect(html.indexOf('Due item')).toBeLessThan(html.indexOf('Flexible Focus'));
    expect(html.indexOf('Flexible Focus')).toBeLessThan(html.indexOf('Flexible item'));

    const rows = elementsOfType<Parameters<typeof TodayTaskRow>[0]>(view, TodayTaskRow);
    expect(rows.map((row) => row.props.task.id)).toEqual(['over-2', 'over-1', 'due-1', 'flex-1']);
    for (const row of rows) {
      expect(row.props.lists).toBe(input.lists);
      expect(row.props.now).toBe(input.now);
      expect(row.props.timeZone).toBe(input.timeZone);
      expect(row.props.hourCycle).toBe(input.hourCycle);
      expect(row.props.onOpen).toBe(input.onOpenTask);
      expect(row.props.onToggle).toBe(input.onToggleTask);
      expect(row.props.onSnooze).toBe(input.onSnoozeTask);
      expect(row.props.onDelete).toBe(input.onDeleteTask);
    }
    rows[0]?.props.onOpen(rows[0].props.task.id);
    rows[0]?.props.onToggle(rows[0].props.task, true);
    rows[0]?.props.onSnooze(rows[0].props.task);
    rows[0]?.props.onDelete(rows[0].props.task);
    expect(input.onOpenTask).toHaveBeenCalledWith('over-2');
    expect(input.onToggleTask).toHaveBeenCalledWith(input.overdue[0], true);
    expect(input.onSnoozeTask).toHaveBeenCalledWith(input.overdue[0]);
    expect(input.onDeleteTask).toHaveBeenCalledWith(input.overdue[0]);
  });

  it('renders the completed accordion closed with its ARIA contract and forwards toggle', () => {
    const input = props({ completedToday: [makeTask('done-1', 'Finished', 'completed')] });
    const view = TodayTaskGroups(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain('Completed today');
    expect(html).toContain(`class="${styles.completedCountBadge}">1</span>`);
    expect(html).toContain('aria-expanded="false" aria-controls="completed-today-list"');
    expect(html).toContain('id="completed-today-list"');
    expect(html).toContain(`class="${styles.completedAccordion} "`);
    expect(html).toContain(`class="${styles.chevronIcon} "`);
    expect(html).toContain('Finished');

    const summary = elementsOfType<{ onClick: () => void; 'aria-controls': string }>(
      view,
      'button',
    ).find((button) => button.props['aria-controls'] === 'completed-today-list');
    summary?.props.onClick();
    expect(input.onToggleCompleted).toHaveBeenCalledOnce();
  });

  it('renders the completed accordion open with the same row composition', () => {
    const input = props({
      completedToday: [makeTask('done-1', 'Finished', 'completed')],
      isCompletedOpen: true,
    });
    const view = TodayTaskGroups(input);
    const html = renderToStaticMarkup(view);

    expect(html).toContain('aria-expanded="true" aria-controls="completed-today-list"');
    expect(html).toContain(`${styles.completedAccordion} ${styles.completedAccordionOpen}`);
    expect(html).toContain(`${styles.chevronIcon} ${styles.chevronIconOpen}`);
    const rows = elementsOfType<Parameters<typeof TodayTaskRow>[0]>(view, TodayTaskRow);
    expect(rows.map((row) => row.props.task.id)).toEqual(['done-1']);
    expect(rows[0]?.props.onToggle).toBe(input.onToggleTask);
  });
});
