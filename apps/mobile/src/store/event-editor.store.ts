import { create } from 'zustand';

interface EventEditorState {
  isOpen: boolean;
  /** Null means "create a new event". */
  eventId: string | null;
  /** Pre-fills an exact start time when created from a calendar slot. */
  seedStart: string | null;
  /**
   * Pre-fills the day only (`YYYY-MM-DD`, in the profile's zone), when the
   * caller knows which day but not which hour — the editor then picks a
   * sensible hour rather than midnight.
   */
  seedDateKey: string | null;

  openNew: (seedStart?: Date) => void;
  openNewOnDay: (dateKey: string) => void;
  openEvent: (eventId: string) => void;
  close: () => void;
}

export const useEventEditorStore = create<EventEditorState>((set) => ({
  isOpen: false,
  eventId: null,
  seedStart: null,
  seedDateKey: null,

  openNew: (seedStart) =>
    set({
      isOpen: true,
      eventId: null,
      seedStart: seedStart?.toISOString() ?? null,
      seedDateKey: null,
    }),
  openNewOnDay: (dateKey) =>
    set({ isOpen: true, eventId: null, seedStart: null, seedDateKey: dateKey }),
  openEvent: (eventId) => set({ isOpen: true, eventId, seedStart: null, seedDateKey: null }),
  close: () => set({ isOpen: false, eventId: null, seedStart: null, seedDateKey: null }),
}));
