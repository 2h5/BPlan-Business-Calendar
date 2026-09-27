// @vitest-environment jsdom
import '../../../test/dom';

import type { Task } from '@cal/schemas';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TaskInspector } from './TaskInspector';
import type { TaskWithTags } from '../api/tasks.api';

const baseTask: Task = {
  id: '00000000-0000-0000-0000-000000000001',
  userId: '11111111-1111-1111-1111-111111111111',
  listId: null,
  title: 'Existing task',
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
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

function task(overrides: Partial<TaskWithTags> = {}): TaskWithTags {
  return { ...baseTask, tagIds: [], ...overrides };
}

const firstTask = task();
const secondTask = task({ id: '00000000-0000-0000-0000-000000000002', title: 'Second task' });

type Props = ComponentProps<typeof TaskInspector>;

function props(overrides: Partial<Props> = {}): Props {
  return {
    task: null,
    isDraft: false,
    isClosing: false,
    timeZone: 'UTC',
    isSaving: false,
    onClose: vi.fn(),
    onCloseAnimationEnd: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
}

function renderInspector(overrides: Partial<Props> = {}) {
  const initial = props(overrides);
  const view = render(<TaskInspector {...initial} />);
  return {
    ...view,
    props: initial,
    rerenderWith: (next: Partial<Props>) => view.rerender(<TaskInspector {...initial} {...next} />),
  };
}

function titleInput() {
  return screen.getByLabelText('Title');
}

describe('TaskInspector draft title focus', () => {
  it('focuses the draft title after the 230 ms entry delay, not before', () => {
    vi.useFakeTimers();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderInspector({ isDraft: true });

    act(() => vi.advanceTimersByTime(229));
    expect(titleInput()).not.toHaveFocus();
    expect(focus).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(titleInput()).toHaveFocus();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0]).toBe(titleInput());
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does not restart the delay when the draft re-renders', () => {
    vi.useFakeTimers();
    const { rerenderWith } = renderInspector({ isDraft: true });

    act(() => vi.advanceTimersByTime(200));
    rerenderWith({ isSaving: true });
    act(() => vi.advanceTimersByTime(30));

    expect(titleInput()).toHaveFocus();
  });

  it('cancels the pending focus when the draft is replaced by a selected task', () => {
    vi.useFakeTimers();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const { rerenderWith } = renderInspector({ isDraft: true });

    act(() => vi.advanceTimersByTime(100));
    rerenderWith({ isDraft: false, task: firstTask });
    act(() => vi.advanceTimersByTime(1000));

    expect(titleInput()).toHaveValue('Existing task');
    expect(titleInput()).not.toHaveFocus();
    expect(focus).not.toHaveBeenCalled();
  });

  it('clears the pending focus timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderInspector({ isDraft: true });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule focus for a selected existing task', () => {
    vi.useFakeTimers();
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderInspector({ task: firstTask });

    act(() => vi.advanceTimersByTime(1000));

    expect(focus).not.toHaveBeenCalled();
    expect(document.body).toHaveFocus();
  });
});

describe('TaskInspector delete confirmation', () => {
  function renderWithDelete(overrides: Partial<Props> = {}) {
    const onDelete = vi.fn();
    const view = renderInspector({ task: firstTask, onDelete, ...overrides });
    const deleteButton = screen.getByRole('button', { name: 'Delete Task' });
    return { ...view, onDelete, deleteButton, user: userEvent.setup() };
  }

  function confirmation() {
    return screen.queryByRole('dialog', { name: 'Confirm task deletion' });
  }

  it('opens from Delete Task and closes from Cancel without deleting', async () => {
    const { user, deleteButton, onDelete } = renderWithDelete();
    expect(deleteButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(deleteButton);
    expect(confirmation()).toBeInTheDocument();
    expect(deleteButton).toHaveAttribute('aria-expanded', 'true');

    const dialog = screen.getByRole('dialog', { name: 'Confirm task deletion' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(confirmation()).not.toBeInTheDocument();
    expect(deleteButton).toHaveAttribute('aria-expanded', 'false');
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('stays open for pointer presses inside the confirmation', async () => {
    const { user, deleteButton } = renderWithDelete();
    await user.click(deleteButton);

    await user.click(screen.getByText('Delete this task?'));
    await user.click(screen.getByText('This action cannot be undone.'));

    expect(confirmation()).toBeInTheDocument();
  });

  it('closes for a pointer press outside the delete area', async () => {
    const { user, deleteButton } = renderWithDelete();
    await user.click(deleteButton);

    await user.click(titleInput());

    expect(confirmation()).not.toBeInTheDocument();
    expect(titleInput()).toHaveFocus();
  });

  it('toggles closed when Delete Task is pressed again', async () => {
    const { user, deleteButton } = renderWithDelete();
    await user.click(deleteButton);

    await user.click(deleteButton);

    expect(confirmation()).not.toBeInTheDocument();
  });

  it('closes on Escape and stops the key before it reaches the target or bubble listeners', async () => {
    const { user, deleteButton } = renderWithDelete();
    const windowCapture = vi.fn();
    const documentBubble = vi.fn();
    const targetListener = vi.fn();
    window.addEventListener('keydown', windowCapture, true);
    document.addEventListener('keydown', documentBubble);
    deleteButton.addEventListener('keydown', targetListener);

    try {
      await user.click(deleteButton);
      expect(deleteButton).toHaveFocus();

      await user.keyboard('{Escape}');

      expect(confirmation()).not.toBeInTheDocument();
      // Capture listeners that run before the document's still see the key.
      expect(windowCapture).toHaveBeenCalledTimes(1);
      expect(targetListener).not.toHaveBeenCalled();
      expect(documentBubble).not.toHaveBeenCalled();
      // stopPropagation only; the default action is left alone.
      expect(windowCapture.mock.calls[0]?.[0]).toHaveProperty('defaultPrevented', false);

      // Once closed, the capture listener is removed and Escape propagates normally.
      await user.keyboard('{Escape}');
      expect(windowCapture).toHaveBeenCalledTimes(2);
      expect(targetListener).toHaveBeenCalledTimes(1);
      expect(documentBubble).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('keydown', windowCapture, true);
      document.removeEventListener('keydown', documentBubble);
    }
  });

  it('ignores keys other than Escape while open', async () => {
    const { user, deleteButton } = renderWithDelete();
    const documentBubble = vi.fn();
    document.addEventListener('keydown', documentBubble);

    try {
      await user.click(deleteButton);
      fireEvent.keyDown(titleInput(), { key: 'a' });

      expect(confirmation()).toBeInTheDocument();
      expect(documentBubble).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', documentBubble);
    }
  });

  it('closes when the selected task changes', async () => {
    const { user, deleteButton, rerenderWith } = renderWithDelete();
    await user.click(deleteButton);

    rerenderWith({ task: secondTask });

    expect(confirmation()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Task' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('stays open when the same task is refetched as a new object', async () => {
    const { user, deleteButton, rerenderWith } = renderWithDelete();
    await user.click(deleteButton);

    rerenderWith({ task: { ...firstTask } });

    expect(confirmation()).toBeInTheDocument();
  });

  it('deletes the selected task from the confirmation and closes it', async () => {
    const { user, onDelete, rerenderWith } = renderWithDelete();
    rerenderWith({ task: secondTask });
    await user.click(screen.getByRole('button', { name: 'Delete Task' }));

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(secondTask);
    expect(confirmation()).not.toBeInTheDocument();
  });
});

describe('TaskInspector title field stability', () => {
  it('keeps the same focused title input while typing and across parent re-renders', async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderInspector({ task: firstTask });
    const input = titleInput();

    await user.click(input);
    await user.type(input, ' updated');

    expect(titleInput()).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Existing task updated');
    expect((input as HTMLInputElement).selectionStart).toBe('Existing task updated'.length);

    rerenderWith({ isSaving: true });
    rerenderWith({ isSaving: false, tags: [] });

    expect(titleInput()).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Existing task updated');

    await user.type(input, '!');
    expect(input).toHaveValue('Existing task updated!');
  });

  it('keeps the title input mounted and focused while editing other fields', async () => {
    const user = userEvent.setup();
    renderInspector({ task: firstTask });
    const input = titleInput();

    await user.type(screen.getByLabelText('Notes / Description'), 'Context');
    await user.click(screen.getByRole('button', { name: '30m' }));
    await user.click(input);
    await user.keyboard('{End}?');

    expect(titleInput()).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('Existing task?');
    expect(screen.getByLabelText('Notes / Description')).toHaveValue('Context');
  });
});

describe('TaskInspector closing animation', () => {
  it('reports the end of the closing animation', () => {
    const { container, props: initial } = renderInspector({ task: firstTask, isClosing: true });

    fireEvent.animationEnd(container.querySelector('aside') as HTMLElement);

    expect(initial.onCloseAnimationEnd).toHaveBeenCalledTimes(1);
  });

  it('reports the end of the closing animation from the empty state', () => {
    const { container, props: initial } = renderInspector({ isClosing: true });

    fireEvent.animationEnd(container.querySelector('aside') as HTMLElement);

    expect(initial.onCloseAnimationEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores animation ends while the inspector is not closing', () => {
    const { container, props: initial, rerenderWith } = renderInspector({ task: firstTask });
    const aside = container.querySelector('aside') as HTMLElement;

    fireEvent.animationEnd(aside);
    expect(initial.onCloseAnimationEnd).not.toHaveBeenCalled();

    rerenderWith({ isClosing: true });
    fireEvent.animationEnd(aside);
    expect(initial.onCloseAnimationEnd).toHaveBeenCalledTimes(1);
  });
});
