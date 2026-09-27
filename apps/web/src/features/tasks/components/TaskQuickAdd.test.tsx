import {
  Children,
  Fragment,
  isValidElement,
  type ChangeEvent,
  type ComponentProps,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import styles from './TaskListPane.module.css';
import { TaskQuickAdd } from './TaskQuickAdd';

type QuickAddProps = Parameters<typeof TaskQuickAdd>[0];

function props(overrides: Partial<QuickAddProps> = {}): QuickAddProps {
  return {
    quickTitle: '',
    quickAddError: null,
    isQuickAdding: false,
    onTitleChange: vi.fn(),
    onSubmit: vi.fn(),
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

describe('TaskQuickAdd', () => {
  it('keeps the form, icon, input, and submit button in order without a DOM wrapper', () => {
    const input = props();
    const tree = TaskQuickAdd(input);
    const html = renderToStaticMarkup(<TaskQuickAdd {...input} />);
    const form = elementsOfType<ComponentProps<'form'>>(tree, 'form')[0];
    const formChildren = Children.toArray(form?.props.children);
    const field = elementsOfType<ComponentProps<'input'>>(form, 'input')[0];
    const button = elementsOfType<ComponentProps<'button'>>(form, 'button')[0];

    expect(tree.type).toBe(Fragment);
    expect(Children.toArray(tree.props.children)).toHaveLength(1);
    expect(form?.props).toMatchObject({ className: styles.quickAddForm, onSubmit: input.onSubmit });
    expect(formChildren.map((child) => (isValidElement(child) ? child.type : null))).toEqual([
      'span',
      'input',
      'button',
    ]);
    expect(html.startsWith(`<form class="${styles.quickAddForm}">`)).toBe(true);
    expect(html).toContain(
      `<span class="${styles.quickAddIcon}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></span>`,
    );
    expect(field?.props).toMatchObject({
      type: 'text',
      className: styles.quickAddInput,
      placeholder: 'Add task to inbox... Press Enter',
      value: '',
      disabled: false,
      'aria-invalid': false,
      onChange: input.onTitleChange,
    });
    expect(field?.props['aria-describedby']).toBeUndefined();
    expect(button?.props).toMatchObject({
      type: 'submit',
      className: styles.quickAddSubmit,
      disabled: true,
      children: 'Add',
    });
    expect(html.endsWith('</form>')).toBe(true);
  });

  it.each([
    { title: 'Write report', disabled: false },
    { title: '  ', disabled: true },
  ])('keeps the $title value and submit disabled rule', ({ title, disabled }) => {
    const tree = TaskQuickAdd(props({ quickTitle: title }));
    const field = elementsOfType<ComponentProps<'input'>>(tree, 'input')[0];
    const button = elementsOfType<ComponentProps<'button'>>(tree, 'button')[0];

    expect(field?.props.value).toBe(title);
    expect(field?.props.disabled).toBe(false);
    expect(button?.props.disabled).toBe(disabled);
    expect(button?.props.children).toBe('Add');
  });

  it('disables input and submit while pending and keeps the Adding… copy', () => {
    const input = props({ quickTitle: 'Write report', isQuickAdding: true });
    const tree = TaskQuickAdd(input);
    const field = elementsOfType<ComponentProps<'input'>>(tree, 'input')[0];
    const button = elementsOfType<ComponentProps<'button'>>(tree, 'button')[0];

    expect(field?.props.disabled).toBe(true);
    expect(button?.props.disabled).toBe(true);
    expect(button?.props.children).toBe('Adding…');
    expect(renderToStaticMarkup(<TaskQuickAdd {...input} />)).toContain('Adding…');
  });

  it('links an error to the input and renders the alert after the form', () => {
    const input = props({ quickTitle: 'Write report', quickAddError: 'Could not add the task.' });
    const tree = TaskQuickAdd(input);
    const children = Children.toArray(tree.props.children);
    const field = elementsOfType<ComponentProps<'input'>>(tree, 'input')[0];
    const alert = elementsOfType<ComponentProps<'p'>>(tree, 'p')[0];
    const html = renderToStaticMarkup(<TaskQuickAdd {...input} />);

    expect(children.map((child) => (isValidElement(child) ? child.type : null))).toEqual([
      'form',
      'p',
    ]);
    expect(field?.props['aria-describedby']).toBe('quick-add-error');
    expect(field?.props['aria-invalid']).toBe(true);
    expect(alert?.props).toMatchObject({
      id: 'quick-add-error',
      className: styles.inlineError,
      role: 'alert',
      children: 'Could not add the task.',
    });
    expect(html).toContain('aria-describedby="quick-add-error" aria-invalid="true"');
    expect(html).toContain(
      `</form><p id="quick-add-error" class="${styles.inlineError}" role="alert">Could not add the task.</p>`,
    );
  });

  it('omits the alert and ARIA link without an error', () => {
    const input = props({ quickTitle: 'Write report' });
    const tree = TaskQuickAdd(input);
    const field = elementsOfType<ComponentProps<'input'>>(tree, 'input')[0];
    const html = renderToStaticMarkup(<TaskQuickAdd {...input} />);

    expect(elementsOfType<ComponentProps<'p'>>(tree, 'p')).toHaveLength(0);
    expect(field?.props['aria-describedby']).toBeUndefined();
    expect(field?.props['aria-invalid']).toBe(false);
    expect(html).not.toContain('quick-add-error');
    expect(html).toContain('aria-invalid="false"');
  });

  it('forwards input changes and submit events to the supplied handlers', () => {
    const input = props();
    const tree = TaskQuickAdd(input);
    const field = elementsOfType<ComponentProps<'input'>>(tree, 'input')[0];
    const form = elementsOfType<ComponentProps<'form'>>(tree, 'form')[0];
    const changeEvent = { target: { value: 'New task' } } as ChangeEvent<HTMLInputElement>;
    const submitEvent = { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;

    field?.props.onChange?.(changeEvent);
    form?.props.onSubmit?.(submitEvent);
    expect(input.onTitleChange).toHaveBeenCalledWith(changeEvent);
    expect(input.onSubmit).toHaveBeenCalledWith(submitEvent);
    expect(submitEvent.preventDefault).not.toHaveBeenCalled();
  });
});
