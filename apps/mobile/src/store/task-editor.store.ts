import type { TaskPriority } from '@cal/schemas';
import { create } from 'zustand';

/** What was typed in Quick Add before "More options", carried into the full editor. */
export interface TaskDraft {
  title: string;
  priority: TaskPriority;
  /** UTC ISO string. */
  dueAt: string | null;
  estimatedMinutes: number | null;
}

interface TaskEditorState {
  isOpen: boolean;
  /** Null means "create a new task". */
  taskId: string | null;
  defaultListId: string | null;
  /** Pre-fills a new task; null starts from an empty form. */
  draft: TaskDraft | null;

  openNew: (defaultListId?: string | null, draft?: TaskDraft | null) => void;
  openTask: (taskId: string) => void;
  close: () => void;
}

/**
 * The task editor is reachable from the inbox, from Today, and from Quick Add,
 * so which task it is editing is UI state that outlives any one screen.
 */
export const useTaskEditorStore = create<TaskEditorState>((set) => ({
  isOpen: false,
  taskId: null,
  defaultListId: null,
  draft: null,

  openNew: (defaultListId = null, draft = null) =>
    set({ isOpen: true, taskId: null, defaultListId, draft }),
  openTask: (taskId) => set({ isOpen: true, taskId, defaultListId: null, draft: null }),
  close: () => set({ isOpen: false, taskId: null, defaultListId: null, draft: null }),
}));
