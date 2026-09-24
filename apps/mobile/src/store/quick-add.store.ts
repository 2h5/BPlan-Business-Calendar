import { create } from 'zustand';

export type QuickAddMode = 'task' | 'event' | 'block';

/**
 * How long to wait after closing Quick Add before presenting another sheet.
 * Sheets are native modals: one presented while Quick Add is still animating
 * out is stacked on top of it, and is torn down with it when Quick Add's
 * modal dismisses — leaving the next sheet "open" but invisible. The sheet's
 * close animation is `motion.duration.base` (180ms); this clears it.
 */
const HAND_OFF_DELAY_MS = 320;

interface QuickAddState {
  isOpen: boolean;
  mode: QuickAddMode;
  /** Pre-fills the date when opened from a specific day in the calendar. */
  seedDateKey: string | null;

  open: (mode?: QuickAddMode, seedDateKey?: string) => void;
  close: () => void;
  /** Closes Quick Add, then runs `next` (which opens another sheet) once it has gone. */
  handOff: (next: () => void) => void;
  setMode: (mode: QuickAddMode) => void;
}

export const useQuickAddStore = create<QuickAddState>((set) => ({
  isOpen: false,
  mode: 'task',
  seedDateKey: null,

  open: (mode = 'task', seedDateKey) =>
    set({ isOpen: true, mode, seedDateKey: seedDateKey ?? null }),
  close: () => set({ isOpen: false, seedDateKey: null }),
  handOff: (next) => {
    set({ isOpen: false, seedDateKey: null });
    setTimeout(next, HAND_OFF_DELAY_MS);
  },
  setMode: (mode) => set({ mode }),
}));
