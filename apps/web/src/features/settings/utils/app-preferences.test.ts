import { DEFAULT_APP_PREFERENCES, parseAppPreferences } from '@cal/schemas';
import { describe, expect, it } from 'vitest';

import { hotkeyOwner, toHotkey } from './app-preferences';

describe('parseAppPreferences', () => {
  it('returns defaults for missing or non-object input', () => {
    expect(parseAppPreferences(undefined)).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences('nope')).toEqual(DEFAULT_APP_PREFERENCES);
    expect(parseAppPreferences([])).toEqual(DEFAULT_APP_PREFERENCES);
    expect(DEFAULT_APP_PREFERENCES).toEqual({
      accountMenuTrigger: 'click',
      showPlanInSidebar: true,
      showSearchInSidebar: true,
      workspaceOrder: ['today', 'calendar', 'tasks', 'search'],
      sidebarOnLaunch: 'remember',
      calendarHotkeys: { enabled: true, day: 'd', week: 'w', month: 'm' },
      showEventDetails: false,
      showWorkingHours: true,
    });
  });

  it('keeps shortcuts off for users who turned them off', () => {
    expect(parseAppPreferences({ calendarHotkeys: { enabled: false } }).calendarHotkeys).toEqual({
      enabled: false,
      day: 'd',
      week: 'w',
      month: 'm',
    });
  });

  it('keeps valid fields and falls back per field for invalid ones', () => {
    expect(
      parseAppPreferences({
        accountMenuTrigger: 'hover',
        showPlanInSidebar: 'no',
        calendarHotkeys: { enabled: true, day: 'x', week: 'Shift', month: 7 },
      }),
    ).toEqual({
      accountMenuTrigger: 'hover',
      showPlanInSidebar: true,
      showSearchInSidebar: true,
      workspaceOrder: ['today', 'calendar', 'tasks', 'search'],
      sidebarOnLaunch: 'remember',
      calendarHotkeys: { enabled: true, day: 'x', week: 'w', month: 'm' },
      showEventDetails: false,
      showWorkingHours: true,
    });
    expect(parseAppPreferences({ accountMenuTrigger: 'long-press' }).accountMenuTrigger).toBe(
      'click',
    );
  });

  it('ignores unknown keys from older or newer versions', () => {
    expect(parseAppPreferences({ retiredSetting: true })).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it('restores default bindings when two views share a key, keeping enabled', () => {
    expect(
      parseAppPreferences({ calendarHotkeys: { enabled: true, day: 'w', week: 'w', month: 'm' } })
        .calendarHotkeys,
    ).toEqual({ enabled: true, day: 'd', week: 'w', month: 'm' });
  });
});

describe('toHotkey', () => {
  it('accepts single letters and digits, lowercased', () => {
    expect(toHotkey('W')).toBe('w');
    expect(toHotkey('3')).toBe('3');
  });

  it('rejects modifiers, named keys, and symbols', () => {
    expect(toHotkey('Shift')).toBeNull();
    expect(toHotkey('Enter')).toBeNull();
    expect(toHotkey(' ')).toBeNull();
    expect(toHotkey('/')).toBeNull();
  });
});

describe('hotkeyOwner', () => {
  const hotkeys = { enabled: true, day: 'd', week: 'w', month: 'm' };

  it('finds the view bound to a key, excluding the one being edited', () => {
    expect(hotkeyOwner(hotkeys, 'w', 'day')).toBe('week');
    expect(hotkeyOwner(hotkeys, 'd', 'day')).toBeNull();
    expect(hotkeyOwner(hotkeys, 'q')).toBeNull();
  });
});
