import type { Tag, TaskList } from '@cal/schemas';
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

import styles from './TaskInspector.module.css';
import { TaskInspectorFields, type TaskInspectorFieldsProps } from './TaskInspectorFields';
import { emptyTaskInspectorForm } from './utils/taskInspectorForm';
import { Select } from '../../../components/forms/Select';

const lists: TaskList[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    userId: '11111111-1111-1111-1111-111111111111',
    name: 'Work',
    color: '#123456',
    position: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    userId: '11111111-1111-1111-1111-111111111111',
    name: 'Personal',
    color: '#654321',
    position: 1,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  },
];

const tags: Tag[] = [
  {
    id: '00000000-0000-0000-0000-000000000011',
    userId: '11111111-1111-1111-1111-111111111111',
    name: 'Urgent',
    color: '#e63232',
  },
  {
    id: '00000000-0000-0000-0000-000000000012',
    userId: '11111111-1111-1111-1111-111111111111',
    name: 'Home',
    color: '#3465aa',
  },
];

function props(overrides: Partial<TaskInspectorFieldsProps> = {}): TaskInspectorFieldsProps {
  return {
    values: emptyTaskInspectorForm(),
    titleInputRef: { current: null },
    errorMessage: null,
    lists,
    tags,
    onTitleChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onDueDateChange: vi.fn(),
    onClearDue: vi.fn(),
    onHasDueTimeChange: vi.fn(),
    onDueTimeChange: vi.fn(),
    onEstimatedMinutesChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onListChange: vi.fn(),
    onTagToggle: vi.fn(),
    onIsFlexibleChange: vi.fn(),
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

function inputs(node: ReactNode): ReactElement<ComponentProps<'input'>>[] {
  return elementsOfType<ComponentProps<'input'>>(node, 'input');
}

describe('TaskInspectorFields', () => {
  it('keeps title and description controls, error attributes, and direct field-group order', () => {
    const input = props({
      values: { ...emptyTaskInspectorForm(), title: 'Plan launch', description: 'Notes' },
      errorMessage: 'Please enter a task title.',
    });
    const tree = TaskInspectorFields(input);
    const html = renderToStaticMarkup(<TaskInspectorFields {...input} />);
    const groups = Children.toArray(tree.props.children);
    const title = inputs(tree).find((element) => element.props.id === 'task-title');
    const description = elementsOfType<ComponentProps<'textarea'>>(tree, 'textarea')[0];

    expect(tree.type).toBe(Fragment);
    expect(groups).toHaveLength(8);
    expect(
      groups.every(
        (group) =>
          isValidElement<{ className?: string }>(group) &&
          group.props.className === styles.fieldGroup,
      ),
    ).toBe(true);
    expect(title?.props).toMatchObject({
      ref: input.titleInputRef,
      type: 'text',
      value: 'Plan launch',
      placeholder: 'What needs to be done?',
      required: true,
      'aria-invalid': true,
      'aria-describedby': 'task-form-error',
    });
    expect(description?.props).toMatchObject({
      id: 'task-desc',
      value: 'Notes',
      placeholder: 'Add context, links, or notes...',
    });
    expect(html).toContain('for="task-title">Title</label>');
    expect(html).toContain('for="task-desc">Notes / Description</label>');
    expect(html.indexOf('task-title')).toBeLessThan(html.indexOf('task-desc'));
    expect(html.indexOf('task-desc')).toBeLessThan(html.indexOf('Due date &amp; time'));
  });

  it('shows only the date input when no due date is selected', () => {
    const tree = TaskInspectorFields(props({ tags: [] }));
    const dueDate = inputs(tree).find((element) => element.props.type === 'date');
    const checkboxes = inputs(tree).filter((element) => element.props.type === 'checkbox');
    const buttons = elementsOfType<ComponentProps<'button'>>(tree, 'button');

    expect(dueDate?.props).toMatchObject({ value: '', 'aria-label': 'Due date' });
    expect(inputs(tree).some((element) => element.props.type === 'time')).toBe(false);
    expect(checkboxes).toHaveLength(1);
    expect(buttons.some((button) => button.props.children === 'Clear')).toBe(false);
    expect(Children.toArray(tree.props.children)).toHaveLength(7);
  });

  it('shows the due clear and time toggle without a time input for a date-only task', () => {
    const tree = TaskInspectorFields(
      props({ values: { ...emptyTaskInspectorForm(), dueDate: '2026-09-27' } }),
    );
    const checkboxes = inputs(tree).filter((element) => element.props.type === 'checkbox');
    const clearButtons = elementsOfType<ComponentProps<'button'>>(tree, 'button').filter(
      (button) => button.props.children === 'Clear',
    );

    expect(inputs(tree).find((element) => element.props.type === 'date')?.props.value).toBe(
      '2026-09-27',
    );
    expect(checkboxes[0]?.props.checked).toBe(false);
    expect(inputs(tree).some((element) => element.props.type === 'time')).toBe(false);
    expect(clearButtons).toHaveLength(1);
    expect(clearButtons[0]?.props.className).toBe(styles.clearFieldBtn);
  });

  it('shows the time input only when the due date and time toggle are set', () => {
    const tree = TaskInspectorFields(
      props({
        values: {
          ...emptyTaskInspectorForm(),
          dueDate: '2026-09-27',
          dueTime: '09:45',
          hasDueTime: true,
        },
      }),
    );
    const checkboxes = inputs(tree).filter((element) => element.props.type === 'checkbox');

    expect(checkboxes[0]?.props.checked).toBe(true);
    expect(inputs(tree).find((element) => element.props.type === 'time')?.props).toMatchObject({
      value: '09:45',
      'aria-label': 'Due time',
      className: styles.timeInput,
    });
  });

  it('keeps duration preset order, copy, active styling, and clear visibility', () => {
    const tree = TaskInspectorFields(
      props({ values: { ...emptyTaskInspectorForm(), estimatedMinutes: 90 } }),
    );
    const buttons = elementsOfType<ComponentProps<'button'>>(tree, 'button');
    const presets = buttons.filter((button) =>
      button.props.className?.includes(styles.presetBtn ?? '__missing__'),
    );

    expect(presets.map((button) => button.props.children)).toEqual([
      '15m',
      '30m',
      '45m',
      '1h',
      '1.5h',
      '2h',
    ]);
    expect(presets.map((button) => button.props.className)).toEqual([
      `${styles.presetBtn} `,
      `${styles.presetBtn} `,
      `${styles.presetBtn} `,
      `${styles.presetBtn} `,
      `${styles.presetBtn} ${styles.presetBtnActive}`,
      `${styles.presetBtn} `,
    ]);
    expect(buttons.filter((button) => button.props.children === 'Clear')).toHaveLength(1);
  });

  it('keeps priority and list Select values and option ordering', () => {
    const tree = TaskInspectorFields(
      props({
        values: { ...emptyTaskInspectorForm(), priority: 'urgent', listId: lists[1]?.id ?? null },
      }),
    );
    const selects = elementsOfType<ComponentProps<typeof Select>>(tree, Select);

    expect(
      selects.map((select) => [select.props.id, select.props.value, select.props.ariaLabel]),
    ).toEqual([
      ['task-priority', 'urgent', 'Priority'],
      ['task-list', lists[1]?.id, 'List'],
    ]);
    expect(selects[0]?.props.options.map(({ value, label }) => [value, label])).toEqual([
      ['low', 'Low'],
      ['normal', 'Normal'],
      ['high', 'High'],
      ['urgent', 'Urgent'],
    ]);
    expect(selects[1]?.props.options.map(({ value, label }) => [value, label])).toEqual([
      ['', 'Inbox (No List)'],
      [lists[0]?.id, 'Work'],
      [lists[1]?.id, 'Personal'],
    ]);
    expect(selects.map((select) => select.props.className)).toEqual([
      styles.flatSelect,
      styles.flatSelect,
    ]);
  });

  it('keeps tag order, selected styling, dot colors, and flexible checkbox state', () => {
    const tree = TaskInspectorFields(
      props({
        values: {
          ...emptyTaskInspectorForm(),
          selectedTagIds: [tags[1]?.id ?? ''],
          isFlexible: false,
        },
      }),
    );
    const tagButtons = elementsOfType<ComponentProps<'button'>>(tree, 'button').filter((button) =>
      button.props.className?.includes(styles.tagChip ?? '__missing__'),
    );
    const checkboxes = inputs(tree).filter((element) => element.props.type === 'checkbox');
    const html = renderToStaticMarkup(
      <TaskInspectorFields
        {...props({
          values: {
            ...emptyTaskInspectorForm(),
            selectedTagIds: [tags[1]?.id ?? ''],
            isFlexible: false,
          },
        })}
      />,
    );

    expect(
      tagButtons.map(
        (button) => elementsOfType<ComponentProps<'span'>>(button, 'span')[1]?.props.children,
      ),
    ).toEqual(['Urgent', 'Home']);
    expect(tagButtons.map((button) => button.props.className)).toEqual([
      `${styles.tagChip} `,
      `${styles.tagChip} ${styles.tagChipSelected}`,
    ]);
    expect(
      tagButtons.map(
        (button) =>
          elementsOfType<ComponentProps<'span'>>(button, 'span')[0]?.props.style?.backgroundColor,
      ),
    ).toEqual(['#e63232', '#3465aa']);
    expect(checkboxes).toHaveLength(1);
    expect(checkboxes[0]?.props.checked).toBe(false);
    expect(html).toContain('Flexible for AI scheduling');
  });

  it('forwards field actions and retains priority/list value conversions', () => {
    const input = props({
      values: {
        ...emptyTaskInspectorForm(),
        dueDate: '2026-09-27',
        dueTime: '09:45',
        hasDueTime: true,
        estimatedMinutes: 30,
      },
    });
    const tree = TaskInspectorFields(input);
    const allInputs = inputs(tree);
    const buttons = elementsOfType<ComponentProps<'button'>>(tree, 'button');
    const selects = elementsOfType<ComponentProps<typeof Select>>(tree, Select);
    const title = allInputs.find((element) => element.props.id === 'task-title');
    const description = elementsOfType<ComponentProps<'textarea'>>(tree, 'textarea')[0];
    const date = allInputs.find((element) => element.props.type === 'date');
    const time = allInputs.find((element) => element.props.type === 'time');
    const checkboxes = allInputs.filter((element) => element.props.type === 'checkbox');
    const clearButtons = buttons.filter((button) => button.props.children === 'Clear');
    const preset = buttons.find((button) => button.props.children === '45m');
    const tag = buttons.find((button) =>
      button.props.className?.includes(styles.tagChip ?? '__missing__'),
    );

    title?.props.onChange?.({ target: { value: 'Changed title' } } as never);
    description?.props.onChange?.({ target: { value: 'Changed notes' } } as never);
    date?.props.onChange?.({ target: { value: '2026-09-28' } } as never);
    clearButtons[0]?.props.onClick?.({} as never);
    checkboxes[0]?.props.onChange?.({ target: { checked: false } } as never);
    time?.props.onChange?.({ target: { value: '10:30' } } as never);
    clearButtons[1]?.props.onClick?.({} as never);
    preset?.props.onClick?.({} as never);
    selects[0]?.props.onChange('high');
    selects[1]?.props.onChange('');
    selects[1]?.props.onChange(lists[0]?.id ?? '');
    tag?.props.onClick?.({} as never);
    checkboxes[1]?.props.onChange?.({ target: { checked: false } } as never);

    expect(input.onTitleChange).toHaveBeenCalledWith('Changed title');
    expect(input.onDescriptionChange).toHaveBeenCalledWith('Changed notes');
    expect(input.onDueDateChange).toHaveBeenCalledWith('2026-09-28');
    expect(input.onClearDue).toHaveBeenCalledTimes(1);
    expect(input.onHasDueTimeChange).toHaveBeenCalledWith(false);
    expect(input.onDueTimeChange).toHaveBeenCalledWith('10:30');
    expect(input.onEstimatedMinutesChange).toHaveBeenNthCalledWith(1, null);
    expect(input.onEstimatedMinutesChange).toHaveBeenNthCalledWith(2, 45);
    expect(input.onPriorityChange).toHaveBeenCalledWith('high');
    expect(input.onListChange).toHaveBeenNthCalledWith(1, null);
    expect(input.onListChange).toHaveBeenNthCalledWith(2, lists[0]?.id);
    expect(input.onTagToggle).toHaveBeenCalledWith(tags[0]?.id);
    expect(input.onIsFlexibleChange).toHaveBeenCalledWith(false);
  });
});
