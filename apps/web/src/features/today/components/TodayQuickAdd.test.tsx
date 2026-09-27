import type { TaskPriority } from '@cal/schemas';
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TodayQuickAdd, type TodayQuickAddProps } from './TodayQuickAdd';
import styles from './TodayView.module.css';
import { Select } from '../../../components/forms/Select';

function props(overrides: Partial<TodayQuickAddProps> = {}): TodayQuickAddProps {
  return {
    isOpen: false,
    isFullyOpen: false,
    title: '',
    listId: '',
    priority: 'normal',
    isSubmitting: false,
    inputRef: { current: null },
    hasLists: true,
    listOptions: [
      { value: '', label: 'Inbox' },
      { value: 'work', label: 'Work' },
    ],
    priorityOptions: [
      { value: 'normal', label: 'Normal Priority' },
      { value: 'high', label: 'High Priority' },
      { value: 'urgent', label: 'Urgent' },
      { value: 'low', label: 'Low Priority' },
    ],
    onTitleChange: vi.fn(),
    onListChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onCancel: vi.fn(),
    onSubmit: vi.fn(),
    onTransitionEnd: vi.fn(),
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

describe('TodayQuickAdd', () => {
  it('keeps closed, open, and fully-open accordion classes on the same wrappers', () => {
    const closed = renderToStaticMarkup(<TodayQuickAdd {...props()} />);
    const open = renderToStaticMarkup(<TodayQuickAdd {...props({ isOpen: true })} />);
    const fullyOpen = renderToStaticMarkup(
      <TodayQuickAdd {...props({ isOpen: true, isFullyOpen: true })} />,
    );

    expect(closed).toContain(`class="${styles.quickAddAccordion} "`);
    expect(closed).toContain(`class="${styles.quickAddAccordionInner} "`);
    expect(open).toContain(`class="${styles.quickAddAccordion} ${styles.quickAddAccordionOpen}"`);
    expect(open).toContain(`class="${styles.quickAddAccordionInner} "`);
    expect(fullyOpen).toContain(
      `class="${styles.quickAddAccordionInner} ${styles.quickAddAccordionInnerOpen}"`,
    );
    expect(fullyOpen).toContain('placeholder="What needs doing today? (Press Enter to add)"');
    expect(fullyOpen).toContain(`class="${styles.quickAddBox}"`);
  });

  it('shows the list Select only with lists and preserves values, options, and Select settings', () => {
    const input = props({ listId: 'work', priority: 'urgent' });
    const selects = elementsOfType<ComponentProps<typeof Select>>(TodayQuickAdd(input), Select);

    expect(selects).toHaveLength(2);
    expect(selects.map((select) => select.props.ariaLabel)).toEqual(['Task list', 'Task priority']);
    expect(selects.map((select) => select.props.value)).toEqual(['work', 'urgent']);
    expect(selects.map((select) => select.props.options)).toEqual([
      input.listOptions,
      input.priorityOptions,
    ]);
    expect(selects[0]?.props.options.map(({ value, label }) => [value, label])).toEqual([
      ['', 'Inbox'],
      ['work', 'Work'],
    ]);
    expect(selects[1]?.props.options.map(({ value, label }) => [value, label])).toEqual([
      ['normal', 'Normal Priority'],
      ['high', 'High Priority'],
      ['urgent', 'Urgent'],
      ['low', 'Low Priority'],
    ]);
    expect(selects.map((select) => [select.props.size, select.props.className])).toEqual([
      ['sm', styles.quickSelect],
      ['sm', styles.quickSelect],
    ]);
    expect(renderToStaticMarkup(<TodayQuickAdd {...input} />)).toContain('Urgent');

    const withoutLists = elementsOfType<ComponentProps<typeof Select>>(
      TodayQuickAdd(props({ hasLists: false, listOptions: [{ value: '', label: 'Inbox' }] })),
      Select,
    );
    expect(withoutLists).toHaveLength(1);
    expect(withoutLists[0]?.props.ariaLabel).toBe('Task priority');
  });

  it('keeps submit availability, submitting copy, and every disabled state', () => {
    for (const [title, isSubmitting, expectedDisabled] of [
      ['', false, true],
      ['   ', false, true],
      ['Write notes', false, false],
      ['Write notes', true, true],
    ] as const) {
      const view = TodayQuickAdd(props({ title, isSubmitting }));
      const buttons = elementsOfType<ComponentProps<'button'>>(view, 'button');
      const submit = buttons.find((button) => button.props.type === 'submit');
      const cancel = buttons.find((button) => button.props.children === 'Cancel');
      const input = elementsOfType<ComponentProps<'input'>>(view, 'input')[0];
      const selects = elementsOfType<ComponentProps<typeof Select>>(view, Select);

      expect(submit?.props.disabled).toBe(expectedDisabled);
      expect(submit?.props.children).toBe(isSubmitting ? 'Adding...' : 'Add Task');
      expect(cancel?.props.disabled).toBe(isSubmitting);
      expect(input?.props.disabled).toBe(isSubmitting);
      expect(selects.map((select) => select.props.disabled)).toEqual([isSubmitting, isSubmitting]);
    }
  });

  it('forwards title, list, priority, Cancel, Escape, and form submit without changing the event', () => {
    const input = props({ title: 'Draft' });
    const view = TodayQuickAdd(input);
    const titleInput = elementsOfType<ComponentProps<'input'>>(view, 'input')[0];
    const selects = elementsOfType<ComponentProps<typeof Select>>(view, Select);
    const cancel = elementsOfType<ComponentProps<'button'>>(view, 'button').find(
      (button) => button.props.children === 'Cancel',
    );
    const form = elementsOfType<ComponentProps<'form'>>(view, 'form')[0];
    const submitEvent = { preventDefault: vi.fn() };

    expect(titleInput?.props.ref).toBe(input.inputRef);
    titleInput?.props.onChange?.({ target: { value: 'Draft more' } } as never);
    selects[0]?.props.onChange('work');
    selects[1]?.props.onChange('high' satisfies TaskPriority);
    titleInput?.props.onKeyDown?.({ key: 'Enter' } as never);
    expect(input.onCancel).not.toHaveBeenCalled();
    titleInput?.props.onKeyDown?.({ key: 'Escape' } as never);
    cancel?.props.onClick?.({} as never);
    form?.props.onSubmit?.(submitEvent as never);

    expect(input.onTitleChange).toHaveBeenCalledWith('Draft more');
    expect(input.onListChange).toHaveBeenCalledWith('work');
    expect(input.onPriorityChange).toHaveBeenCalledWith('high');
    expect(input.onCancel).toHaveBeenCalledTimes(2);
    expect(input.onSubmit).toHaveBeenCalledWith(submitEvent);
    expect(submitEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('forwards transition completion for parent target/property/open-state validation', () => {
    const input = props();
    const accordion = TodayQuickAdd(input);
    const event = { target: {}, currentTarget: {}, propertyName: 'opacity' };

    accordion.props.onTransitionEnd(event as never);
    expect(input.onTransitionEnd).toHaveBeenCalledWith(event);
  });
});
