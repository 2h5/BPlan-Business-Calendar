import type { Task } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import {
  emptyTaskInspectorForm,
  inspectorFormToTaskInput,
  taskToInspectorForm,
} from './taskInspectorForm';
import type { TaskWithTags } from '../../api/tasks.api';

const task: Task = {
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

function existingTask(overrides: Partial<TaskWithTags> = {}): TaskWithTags {
  return { ...task, tagIds: [], ...overrides };
}

describe('task inspector form', () => {
  it('resets drafts to the existing defaults with a fresh tag selection', () => {
    const first = emptyTaskInspectorForm();
    expect(first).toEqual({
      title: '',
      description: '',
      priority: 'normal',
      dueDate: '',
      dueTime: '',
      hasDueTime: false,
      estimatedMinutes: null,
      isFlexible: true,
      listId: null,
      selectedTagIds: [],
    });
    expect(emptyTaskInspectorForm().selectedTagIds).not.toBe(first.selectedTagIds);
  });

  it('loads existing fields and formats the due instant in the selected timezone', () => {
    const tags = ['tag-1'];
    const selected = existingTask({
      title: '  Keep spaces  ',
      description: '  Keep notes  ',
      priority: 'urgent',
      dueAt: '2026-01-01T02:05:00.000Z',
      hasDueTime: true,
      estimatedMinutes: 90,
      isFlexible: false,
      listId: 'list-1',
      tagIds: tags,
    });
    expect(taskToInspectorForm(selected, 'America/New_York')).toEqual({
      title: '  Keep spaces  ',
      description: '  Keep notes  ',
      priority: 'urgent',
      dueDate: '2025-12-31',
      dueTime: '21:05',
      hasDueTime: true,
      estimatedMinutes: 90,
      isFlexible: false,
      listId: 'list-1',
      selectedTagIds: tags,
    });
    expect(taskToInspectorForm(selected, 'Asia/Tokyo').dueDate).toBe('2026-01-01');
    expect(taskToInspectorForm(selected, 'America/New_York').selectedTagIds).toBe(tags);
  });

  it('hides the time for date-only tasks and clears stale time flags with no due date', () => {
    expect(
      taskToInspectorForm(
        existingTask({ dueAt: '2026-09-27T16:00:00.000Z', hasDueTime: false }),
        'America/New_York',
      ),
    ).toMatchObject({ dueDate: '2026-09-27', dueTime: '', hasDueTime: false });
    expect(taskToInspectorForm(existingTask({ hasDueTime: true }), 'UTC')).toMatchObject({
      description: '',
      dueDate: '',
      dueTime: '',
      hasDueTime: false,
    });
  });

  it('trims title and description and builds the exact draft payload', () => {
    const form = {
      ...emptyTaskInspectorForm(),
      title: '  Plan launch  ',
      description: '  Review scope  ',
      priority: 'high' as const,
      dueDate: '2026-09-27',
      dueTime: '09:45',
      hasDueTime: true,
      estimatedMinutes: 60,
      isFlexible: false,
      listId: 'list-1',
      selectedTagIds: ['tag-1', 'tag-2'],
    };
    expect(inspectorFormToTaskInput(form, 'America/New_York')).toEqual({
      title: 'Plan launch',
      description: 'Review scope',
      priority: 'high',
      dueAt: '2026-09-27T13:45:00.000Z',
      hasDueTime: true,
      estimatedMinutes: 60,
      isFlexible: false,
      listId: 'list-1',
      tagIds: ['tag-1', 'tag-2'],
    });
  });

  it('rejects a blank trimmed title before converting the due date', () => {
    expect(
      inspectorFormToTaskInput(
        { ...emptyTaskInspectorForm(), title: '  ', dueDate: 'invalid' },
        'America/New_York',
      ),
    ).toBeNull();
  });

  it('serializes date-only due dates at local noon across DST', () => {
    const base = { ...emptyTaskInspectorForm(), title: 'Date only', hasDueTime: false };
    expect(
      inspectorFormToTaskInput({ ...base, dueDate: '2026-01-15' }, 'America/New_York'),
    ).toMatchObject({ dueAt: '2026-01-15T17:00:00.000Z', hasDueTime: false });
    expect(
      inspectorFormToTaskInput({ ...base, dueDate: '2026-07-15' }, 'America/New_York'),
    ).toMatchObject({ dueAt: '2026-07-15T16:00:00.000Z', hasDueTime: false });
  });

  it('keeps the time flag when enabled with an empty time and uses noon', () => {
    expect(
      inspectorFormToTaskInput(
        {
          ...emptyTaskInspectorForm(),
          title: 'No chosen time',
          dueDate: '2026-01-15',
          hasDueTime: true,
        },
        'America/New_York',
      ),
    ).toMatchObject({ dueAt: '2026-01-15T17:00:00.000Z', hasDueTime: true });
  });

  it('keeps the domain helper DST gap and overlap policies during save', () => {
    const base = { ...emptyTaskInspectorForm(), title: 'DST', hasDueTime: true };
    expect(
      inspectorFormToTaskInput(
        { ...base, dueDate: '2026-03-08', dueTime: '02:30' },
        'America/New_York',
      ),
    ).toMatchObject({ dueAt: '2026-03-08T07:30:00.000Z', hasDueTime: true });
    expect(
      inspectorFormToTaskInput(
        { ...base, dueDate: '2026-11-01', dueTime: '01:30' },
        'America/New_York',
      ),
    ).toMatchObject({ dueAt: '2026-11-01T05:30:00.000Z', hasDueTime: true });
  });

  it('builds an update payload with explicit nulls when the due date is cleared', () => {
    const form = {
      ...emptyTaskInspectorForm(),
      title: '  Updated  ',
      description: '   ',
      dueTime: '08:30',
      hasDueTime: true,
      listId: '',
      selectedTagIds: ['tag-1'],
    };
    expect(inspectorFormToTaskInput(form, 'UTC', task.id)).toEqual({
      id: task.id,
      title: 'Updated',
      description: null,
      priority: 'normal',
      dueAt: null,
      hasDueTime: false,
      estimatedMinutes: null,
      isFlexible: true,
      listId: null,
      tagIds: ['tag-1'],
    });
  });

  it('retains the existing missing date-part defaults', () => {
    expect(
      inspectorFormToTaskInput(
        { ...emptyTaskInspectorForm(), title: 'Fallback', dueDate: '2026' },
        'UTC',
      ),
    ).toMatchObject({ dueAt: '2026-01-01T12:00:00.000Z', hasDueTime: false });
  });
});
