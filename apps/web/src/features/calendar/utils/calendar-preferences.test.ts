import { beforeEach, describe, expect, it } from 'vitest';

import {
  CALENDAR_VIEW_STORAGE_KEY,
  getDefaultCalendarView,
  isValidCalendarViewMode,
  setDefaultCalendarView,
} from './calendar-preferences';

const mockStore: Record<string, string> = {};

const mockStorage = {
  getItem: (key: string) => mockStore[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStore[key] = value;
  },
  removeItem: (key: string) => {
    delete mockStore[key];
  },
  clear: () => {
    for (const key of Object.keys(mockStore)) {
      delete mockStore[key];
    }
  },
};

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  writable: true,
});

describe('calendar-preferences', () => {
  beforeEach(() => {
    mockStorage.clear();
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
    expect(mockStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('week');
    expect(getDefaultCalendarView()).toBe('week');

    setDefaultCalendarView('day');
    expect(mockStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('day');
    expect(getDefaultCalendarView()).toBe('day');

    setDefaultCalendarView('month');
    expect(mockStorage.getItem(CALENDAR_VIEW_STORAGE_KEY)).toBe('month');
    expect(getDefaultCalendarView()).toBe('month');
  });

  it('falls back to month if stored value is invalid', () => {
    mockStorage.setItem(CALENDAR_VIEW_STORAGE_KEY, 'invalid-mode');
    expect(getDefaultCalendarView()).toBe('month');
  });
});
