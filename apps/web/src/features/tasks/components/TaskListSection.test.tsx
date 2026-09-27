import type { TaskList } from '@cal/schemas';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import styles from './TaskListPane.module.css';
import { TaskListSection } from './TaskListSection';
import { TaskRow } from './TaskRow';
import type { TaskWithTags } from '../api/tasks.api';

const now = new Date('2026-09-27T14:00:00.000Z');
const timeZone = 'America/New_York';
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
  dueAt: null,
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

type SectionProps = Parameters<typeof TaskListSection>[0];
type RowProps = Parameters<typeof TaskRow>[0];

function props(overrides: Partial<SectionProps> = {}): SectionProps {
  return {
    title: 'Upcoming',
    tasks: [task],
    selectedTaskId: null,
    lists: [list],
    now,
    timeZone,
    onSelectTask: vi.fn(),
    onToggleComplete: vi.fn(),
    onSnooze: vi.fn(),
    onDelete: vi.fn(),
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

describe('TaskListSection', () => {
  it('omits an empty section', () => {
    expect(TaskListSection(props({ tasks: [] }))).toBeNull();
    expect(renderToStaticMarkup(<TaskListSection {...props({ tasks: [] })} />)).toBe('');
  });

  it.each([
    {
      title: 'Overdue',
      isOverdue: true,
      tone: styles.sectionOverdue,
      icon: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    },
    {
      title: 'Due Today',
      tone: styles.sectionToday,
      icon: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
    },
    {
      title: 'Upcoming',
      tone: styles.sectionUpcoming,
      icon: '<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5"></path>',
    },
    {
      title: 'No Due Date',
      tone: styles.sectionSomeday,
      icon: '<path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5"></path>',
    },
    {
      title: 'Completed',
      tone: styles.sectionCompleted,
      icon: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path>',
    },
    {
      title: 'Completed Today',
      tone: styles.sectionCompleted,
      icon: '<circle cx="12" cy="12" r="9"></circle><path d="m8 12 2.5 2.5L16 9"></path>',
    },
  ])('keeps the original $title section markup and tone', ({ title, isOverdue, tone, icon }) => {
    const html = renderToStaticMarkup(<TaskListSection {...props({ title, isOverdue })} />);
    const header = `<div class="${styles.sectionHeader}"><span class="${styles.sectionTitle}"><span class="${styles.sectionIcon}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span><span>${title}</span></span><span class="${styles.sectionCount}">1</span></div>`;

    expect(html).toMatch(new RegExp(`^<section class="${styles.section} ${tone}">`));
    expect(html).toContain(header);
    expect(html).toContain(`<div class="${styles.sectionItems}">`);
    expect(html.endsWith('</section>')).toBe(true);
  });

  it('keeps the supplied task order, count, selection, context, and callbacks', () => {
    const first = { ...task, id: 'first', title: 'First' };
    const second = { ...task, id: 'second', title: 'Second' };
    const input = props({ tasks: [second, first], selectedTaskId: first.id });
    const section = TaskListSection(input);
    const rows = elementsOfType<RowProps>(section, TaskRow);
    const html = renderToStaticMarkup(<TaskListSection {...input} />);

    expect(rows.map((row) => row.props.task)).toEqual([second, first]);
    expect(rows.map((row) => row.props.isSelected)).toEqual([false, true]);
    expect(html).toContain(`<span class="${styles.sectionCount}">2</span>`);
    expect(html.indexOf('Second')).toBeLessThan(html.indexOf('First'));
    for (const row of rows) {
      expect(row.props.lists).toBe(input.lists);
      expect(row.props.now).toBe(now);
      expect(row.props.timeZone).toBe(timeZone);
      expect(row.props.onSelect).toBe(input.onSelectTask);
      expect(row.props.onToggleComplete).toBe(input.onToggleComplete);
      expect(row.props.onSnooze).toBe(input.onSnooze);
      expect(row.props.onDelete).toBe(input.onDelete);
    }

    rows[0]?.props.onSelect(second);
    rows[0]?.props.onToggleComplete(second, true);
    rows[0]?.props.onSnooze(second);
    rows[0]?.props.onDelete(second);
    expect(input.onSelectTask).toHaveBeenCalledWith(second);
    expect(input.onToggleComplete).toHaveBeenCalledWith(second, true);
    expect(input.onSnooze).toHaveBeenCalledWith(second);
    expect(input.onDelete).toHaveBeenCalledWith(second);
  });
});
