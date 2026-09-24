import { create } from 'zustand';

/** How long an undoable action waits before it is carried out. */
export const UNDO_WINDOW_MS = 5000;

export interface UndoableAction {
  /** What the toast says, e.g. "Task deleted". */
  message: string;
  /** Carries the action out — when the window closes, or at once if superseded. */
  commit: () => void;
  /** Reverts the local preview. Runs instead of `commit`, so nothing reaches the server. */
  undo: () => void;
}

interface UndoState {
  pending: (UndoableAction & { id: number }) | null;
  /**
   * Tasks hidden from every list while their delete can still be undone. A
   * filter at read time, rather than a cache edit, so a refetch in the window
   * — another mutation settling, the app regaining focus — cannot resurrect
   * the row before the delete is sent.
   */
  hiddenTaskIds: readonly string[];

  push: (action: UndoableAction) => void;
  undo: () => void;
  /** Commits whatever is pending now, e.g. because the app is leaving the foreground. */
  flush: () => void;
  hideTask: (id: string) => void;
  showTask: (id: string) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Deferred, undoable actions — the Gmail/Todoist pattern. Only one is pending
 * at a time: a second action commits the first rather than queueing behind it.
 */
export const useUndoStore = create<UndoState>((set, get) => ({
  pending: null,
  hiddenTaskIds: [],

  push: (action) => {
    get().flush();
    const id = nextId++;
    set({ pending: { ...action, id } });
    timer = setTimeout(() => {
      if (get().pending?.id === id) get().flush();
    }, UNDO_WINDOW_MS);
  },

  undo: () => {
    clearTimer();
    const { pending } = get();
    set({ pending: null });
    pending?.undo();
  },

  flush: () => {
    clearTimer();
    const { pending } = get();
    if (!pending) return;
    set({ pending: null });
    pending.commit();
  },

  hideTask: (id) =>
    set((state) =>
      state.hiddenTaskIds.includes(id) ? state : { hiddenTaskIds: [...state.hiddenTaskIds, id] },
    ),
  showTask: (id) =>
    set((state) => ({ hiddenTaskIds: state.hiddenTaskIds.filter((hidden) => hidden !== id) })),
}));
