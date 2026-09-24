import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'agenda';

function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return value === 'day' || value === 'week' || value === 'month' || value === 'agenda';
}

interface CalendarViewState {
  mode: CalendarViewMode;
  /** The day the calendar is focused on, as a local date key: "2026-08-30". */
  selectedDateKey: string;
  hiddenCalendarIds: string[];

  setMode: (mode: CalendarViewMode) => void;
  setSelectedDateKey: (dateKey: string) => void;
  toggleCalendarVisibility: (calendarId: string) => void;
}

const todayKey = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

/**
 * UI-only state: which view is showing and what it is focused on. Events
 * themselves are server state and belong to TanStack Query — never mirror them
 * into a store.
 *
 * The chosen view survives a relaunch, like every calendar app; the focused
 * day deliberately does not, so the calendar always reopens on today.
 */
export const useCalendarViewStore = create<CalendarViewState>()(
  persist(
    (set) => ({
      mode: 'week',
      selectedDateKey: todayKey(),
      hiddenCalendarIds: [],

      setMode: (mode) => set({ mode }),
      setSelectedDateKey: (selectedDateKey) => set({ selectedDateKey }),
      toggleCalendarVisibility: (calendarId) =>
        set((state) => ({
          hiddenCalendarIds: state.hiddenCalendarIds.includes(calendarId)
            ? state.hiddenCalendarIds.filter((id) => id !== calendarId)
            : [...state.hiddenCalendarIds, calendarId],
        })),
    }),
    {
      name: 'calendar_view',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mode: state.mode }),
      // Device storage is still input: ignore anything that is not a known view.
      merge: (persisted, current) => {
        const mode = (persisted as { mode?: unknown } | null | undefined)?.mode;
        return isCalendarViewMode(mode) ? { ...current, mode } : current;
      },
    },
  ),
);
