import { beforeEach, describe, expect, it } from 'vitest';

import {
  CALENDAR_VIEW_STORAGE_KEY,
  clearLastCalendarView,
  getActiveCalendarView,
  getDefaultCalendarView,
  getLastCalendarView,
  isValidCalendarViewMode,
  LAST_CALENDAR_VIEW_STORAGE_KEY,
  setDefaultCalendarView,
  setLastCalendarView,
} from './calendar-preferences';

const mockLocalStore: Record<string, string> = {};
const mockSessionStore: Record<string, string> = {};

function createStorage(store: Record<string, string>) {
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    },
  };
}

const mockLocalStorage = createStorage(mockLocalStore);
const mockSessionStorage = createStorage(mockSessionStore);

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: mockSessionStorage,
  writable: true,
});

describe('calendar-preferences', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    clearLastCalendarView();
  });

  it('validates calendar view modes correctly', () => {
    expect(isValidCalendarViewMode('day')).toBe(true);
    expect(isValidCalendarViewMode('week')).toBe(true);
    expect(isValidCalendarViewMode('month')).toBe(true);
    expect(isValidCalendarViewMode('year')).toBe(false);
    expect(isValidCalendarViewMode('')).toBe(false);
    expect(isValidCalendarViewMode(null)).toBe(false);
    expect(isValidCalendarViewMode(undefined)).toBe(false);
  });

  it('defaults to month view when no preference is stored', () => {
    expect(getDefaultCalendarView()).toBe('month');
  });

  it('persists and retrieves custom view preferences', () => {
    setDefaultCalendarView('week');
    expect(mockLocalStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('week');
    expect(getDefaultCalendarView()).toBe('week');

    setDefaultCalendarView('day');
    expect(mockLocalStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('day');
    expect(getDefaultCalendarView()).toBe('day');

    setDefaultCalendarView('month');
    expect(mockLocalStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('month');
    expect(getDefaultCalendarView()).toBe('month');
  });

  it('falls back to month if stored value is invalid', () => {
    mockLocalStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, 'invalid-mode');
    expect(getDefaultCalendarView()).toBe('month');
  });

  it('tracks and retrieves the last clicked calendar view for tab switches', () => {
    expect(getLastCalendarView()).toBeNull();

    setLastCalendarView('day');
    expect(mockSessionStorage.getItem(LAST_CALENDAR_VIEW_STORAGE_KEY)).toBe('day');
    expect(getLastCalendarView()).toBe('day');

    setLastCalendarView('week');
    expect(mockSessionStorage.getItem(LAST_CALENDAR_VIEW_STORAGE_KEY)).toBe('week');
    expect(getLastCalendarView()).toBe('week');
  });

  it('resolves active calendar view prioritizing last clicked view over first-load default', () => {
    // 1. Initial first load with no last-clicked view: uses default preference
    setDefaultCalendarView('month');
    expect(getActiveCalendarView()).toBe('month');

    // 2. User clicks "day" view: active view becomes "day"
    setLastCalendarView('day');
    expect(getActiveCalendarView()).toBe('day');

    // 3. User navigates away and returns: still "day" view even though default is "month"
    expect(getDefaultCalendarView()).toBe('month');
    expect(getActiveCalendarView()).toBe('day');

    // 4. If last view is cleared (e.g. brand new session): returns to default
    clearLastCalendarView();
    expect(getActiveCalendarView()).toBe('month');
  });
});
