import {
  CALENDAR_HOTKEY_VIEWS,
  DEFAULT_APP_PREFERENCES,
  DEFAULT_CALENDAR_HOTKEYS,
  hotkeySchema,
  parseAppPreferences,
  type AppPreferences,
  type CalendarHotkeys,
  type CalendarHotkeyView,
} from '@cal/schemas';

/**
 * Last-known preferences for this browser. The account copy in
 * `profiles.preferences` is the source of truth; this cache only lets the app
 * paint with the right behavior before the profile has loaded.
 */
const APP_PREFERENCES_CACHE_PREFIX = 'bplan_app_preferences:';

export function readCachedAppPreferences(userId: string): AppPreferences {
  if (typeof window === 'undefined') return DEFAULT_APP_PREFERENCES;
  try {
    const stored = localStorage.getItem(APP_PREFERENCES_CACHE_PREFIX + userId);
    return stored ? parseAppPreferences(JSON.parse(stored)) : DEFAULT_APP_PREFERENCES;
  } catch {
    // localStorage unavailable, or the cached JSON is corrupt
    return DEFAULT_APP_PREFERENCES;
  }
}

export function writeCachedAppPreferences(userId: string, preferences: AppPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(APP_PREFERENCES_CACHE_PREFIX + userId, JSON.stringify(preferences));
  } catch {
    // localStorage unavailable or restricted
  }
}

export function defaultCalendarHotkeys(enabled: boolean): CalendarHotkeys {
  return { enabled, ...DEFAULT_CALENDAR_HOTKEYS };
}

/** Normalises a KeyboardEvent key to a bindable hotkey, or null if it cannot be bound. */
export function toHotkey(key: string): string | null {
  const lower = key.toLowerCase();
  return hotkeySchema.safeParse(lower).success ? lower : null;
}

export function hotkeyOwner(
  hotkeys: CalendarHotkeys,
  key: string,
  except?: CalendarHotkeyView,
): CalendarHotkeyView | null {
  return CALENDAR_HOTKEY_VIEWS.find((view) => view !== except && hotkeys[view] === key) ?? null;
}
