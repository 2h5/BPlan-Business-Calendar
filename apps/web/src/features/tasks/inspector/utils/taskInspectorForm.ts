import { getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { CreateTaskInput, TaskPriority, UpdateTaskInput } from '@cal/schemas';

import type { TaskWithTags } from '../../api/tasks.api';

export interface TaskInspectorForm {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  dueTime: string;
  hasDueTime: boolean;
  estimatedMinutes: number | null;
  isFlexible: boolean;
  listId: string | null;
  selectedTagIds: string[];
}

export function emptyTaskInspectorForm(): TaskInspectorForm {
  return {
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
  };
}

export function taskToInspectorForm(task: TaskWithTags, timeZone: string): TaskInspectorForm {
  let dueDate = '';
  let dueTime = '';
  let hasDueTime = false;

  if (task.dueAt) {
    const parts = getZonedParts(new Date(task.dueAt), timeZone);
    const yyyy = String(parts.year);
    const mm = String(parts.month).padStart(2, '0');
    const dd = String(parts.day).padStart(2, '0');
    dueDate = `${yyyy}-${mm}-${dd}`;

    if (task.hasDueTime) {
      const hh = String(parts.hour).padStart(2, '0');
      const min = String(parts.minute).padStart(2, '0');
      dueTime = `${hh}:${min}`;
      hasDueTime = true;
    }
  }

  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    dueDate,
    dueTime,
    hasDueTime,
    estimatedMinutes: task.estimatedMinutes,
    isFlexible: task.isFlexible,
    listId: task.listId,
    selectedTagIds: task.tagIds ?? [],
  };
}

export function inspectorFormToTaskInput(
  form: TaskInspectorForm,
  timeZone: string,
  taskId?: string,
): CreateTaskInput | UpdateTaskInput | null {
  const trimmedTitle = form.title.trim();
  if (!trimmedTitle) return null;

  let dueAtIso: string | null = null;
  if (form.dueDate) {
    const dateParts = form.dueDate.split('-').map(Number);
    const year = dateParts[0] ?? 2026;
    const month = dateParts[1] ?? 1;
    const day = dateParts[2] ?? 1;
    let hour = 12;
    let minute = 0;
    if (form.hasDueTime && form.dueTime) {
      const timeParts = form.dueTime.split(':').map(Number);
      hour = timeParts[0] ?? 12;
      minute = timeParts[1] ?? 0;
    }

    dueAtIso = zonedWallClockToUtc({ year, month, day, hour, minute }, timeZone).toISOString();
  }

  const input: CreateTaskInput = {
    title: trimmedTitle,
    description: form.description.trim() || null,
    priority: form.priority,
    dueAt: dueAtIso,
    hasDueTime: !!(dueAtIso && form.hasDueTime),
    estimatedMinutes: form.estimatedMinutes,
    isFlexible: form.isFlexible,
    listId: form.listId || null,
    tagIds: form.selectedTagIds,
  };

  return taskId === undefined ? input : { id: taskId, ...input };
}
