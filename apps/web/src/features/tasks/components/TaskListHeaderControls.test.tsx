import type { TaskList } from '@cal/schemas';
import {
  Children,
  Fragment,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TaskListHeaderControls } from './TaskListHeaderControls';
import styles from './TaskListPane.module.css';
import { Select } from '../../../components/forms/Select';

type HeaderProps = Parameters<typeof TaskListHeaderControls>[0];
type SelectProps = Parameters<typeof Select>[0];

const lists = [
  { id: 'second', name: 'Work' },
  { id: 'first', name: 'Personal' },
] as TaskList[];

function props(overrides: Partial<HeaderProps> = {}): HeaderProps {
  return {
    lists,
    selectedListId: null,
    activeTab: 'inbox',
    openCount: 7,
    totalTaskCount: 11,
    completedCount: 4,
    onListChange: vi.fn(),
    onTabChange: vi.fn(),
    onNewTaskClick: vi.fn(),
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

describe('TaskListHeaderControls', () => {
  it('keeps title row before toolbar without an extra DOM wrapper', () => {
    const input = props();
    const tree = TaskListHeaderControls(input);
    const children = Children.toArray(tree.props.children);
    const html = renderToStaticMarkup(<TaskListHeaderControls {...input} />);

    expect(tree.type).toBe(Fragment);
    expect(
      children.map((child) =>
        isValidElement<{ className?: string }>(child) ? child.props.className : null,
      ),
    ).toEqual([styles.titleRow, styles.toolbar]);
    expect(html.startsWith(`<div class="${styles.titleRow}">`)).toBe(true);
    expect(html).toContain(`<h1 class="${styles.pageTitle}">Tasks</h1>`);
    expect(html).toContain(
      `<p class="${styles.pageSubtitle}">Stay organized and get more done.</p>`,
    );
    expect(html.indexOf(styles.titleRow ?? '')).toBeLessThan(html.indexOf(styles.toolbar ?? ''));
    expect(html.endsWith('</div></div>')).toBe(true);
  });

  it('keeps the list filter value, size, class, label, and supplied list ordering', () => {
    const tree = TaskListHeaderControls(props({ selectedListId: 'first' }));
    const select = elementsOfType<SelectProps>(tree, Select)[0];

    expect(select?.props).toMatchObject({
      className: styles.listSelect,
      size: 'sm',
      value: 'first',
      ariaLabel: 'Filter by list',
      options: [
        { value: '', label: 'All Lists' },
        { value: 'second', label: 'Work' },
        { value: 'first', label: 'Personal' },
      ],
    });
    expect(
      elementsOfType<SelectProps>(TaskListHeaderControls(props()), Select)[0]?.props.value,
    ).toBe('');
  });

  it('converts the All Lists value to null and forwards a selected list ID', () => {
    const input = props();
    const select = elementsOfType<SelectProps>(TaskListHeaderControls(input), Select)[0];

    select?.props.onChange('');
    select?.props.onChange('second');
    expect(input.onListChange).toHaveBeenNthCalledWith(1, null);
    expect(input.onListChange).toHaveBeenNthCalledWith(2, 'second');
  });

  it('keeps New task markup, icon, ARIA, and callback', () => {
    const input = props();
    const tree = TaskListHeaderControls(input);
    const button = elementsOfType<ComponentProps<'button'>>(tree, 'button')[0];
    const html = renderToStaticMarkup(<TaskListHeaderControls {...input} />);

    expect(button?.props).toMatchObject({
      type: 'button',
      className: styles.newTaskBtn,
      onClick: input.onNewTaskClick,
      title: 'Create task (Inspector)',
      'aria-label': 'Create a new task',
    });
    expect(html).toContain(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg><span>New task</span>`,
    );
    button?.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
    expect(input.onNewTaskClick).toHaveBeenCalledOnce();
  });

  it.each([
    { activeTab: 'inbox' as const, activeIndex: 0 },
    { activeTab: 'all' as const, activeIndex: 1 },
    { activeTab: 'completed' as const, activeIndex: 2 },
  ])(
    'keeps $activeTab active state, tab order, exact counts, and callbacks',
    ({ activeTab, activeIndex }) => {
      const input = props({ activeTab });
      const tree = TaskListHeaderControls(input);
      const buttons = elementsOfType<ComponentProps<'button'>>(tree, 'button').slice(1);
      const html = renderToStaticMarkup(<TaskListHeaderControls {...input} />);

      expect(
        buttons.map((button) =>
          Children.toArray(button.props.children).map((span) =>
            isValidElement<{ children?: ReactNode }>(span) ? span.props.children : null,
          ),
        ),
      ).toEqual([
        ['Inbox', 7],
        ['All', 11],
        ['Done', 4],
      ]);
      expect(buttons.map((button) => button.props.type)).toEqual(['button', 'button', 'button']);
      expect(buttons.map((button) => button.props.className)).toEqual(
        buttons.map(
          (_, index) => `${styles.tabBtn} ${index === activeIndex ? styles.tabBtnActive : ''}`,
        ),
      );
      expect(buttons.map((button) => button.props['aria-pressed'])).toEqual(
        buttons.map((_, index) => index === activeIndex),
      );
      expect(html).toContain(`class="${styles.filterTabs}"`);
      expect(html).toContain(`class="${styles.tabCount}">7</span>`);
      expect(html).toContain(`class="${styles.tabCount}">11</span>`);
      expect(html).toContain(`class="${styles.tabCount}">4</span>`);

      buttons.forEach((button) =>
        button.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>),
      );
      expect(input.onTabChange).toHaveBeenNthCalledWith(1, 'inbox');
      expect(input.onTabChange).toHaveBeenNthCalledWith(2, 'all');
      expect(input.onTabChange).toHaveBeenNthCalledWith(3, 'completed');
    },
  );
});
