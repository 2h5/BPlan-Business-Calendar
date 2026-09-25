import { z } from 'zod';

/**
 * Per-user app behavior preferences, stored in `profiles.preferences`.
 *
 * Every field has its own `.catch` default, so a stored value that is missing,
 * renamed, or malformed falls back to that field's default instead of
 * discarding the whole object. Unknown keys are dropped on parse, which makes
 * retiring a preference safe. Add new preferences here, never ad hoc in an app.
 *
 * Web-only today: `accountMenuTrigger` (sidebar) and `calendarHotkeys` (keyboard).
 */

export type CalendarHotkeyView = 'day' | 'week' | 'month';

export const CALENDAR_HOTKEY_VIEWS: readonly CalendarHotkeyView[] = ['day', 'week', 'month'];

/** A binding is one lowercase letter or digit, pressed without modifiers. */
export const hotkeySchema = z.string().regex(/^[a-z0-9]$/);

export const DEFAULT_CALENDAR_HOTKEYS = { day: 'd', week: 'w', month: 'm' } as const;

const calendarHotkeysSchema = z
  .object({
    // On by default: shortcuts pause while typing or in a dialog, so they are safe to ship on.
    enabled: z.boolean().catch(true),
    day: hotkeySchema.catch(DEFAULT_CALENDAR_HOTKEYS.day),
    week: hotkeySchema.catch(DEFAULT_CALENDAR_HOTKEYS.week),
    month: hotkeySchema.catch(DEFAULT_CALENDAR_HOTKEYS.month),
  })
  .catch({ enabled: true, ...DEFAULT_CALENDAR_HOTKEYS });

export const appPreferencesSchema = z.object({
  accountMenuTrigger: z.enum(['click', 'hover']).catch('click'),
  calendarHotkeys: calendarHotkeysSchema,
});

export type AppPreferences = z.infer<typeof appPreferencesSchema>;
export type AccountMenuTrigger = AppPreferences['accountMenuTrigger'];
export type CalendarHotkeys = AppPreferences['calendarHotkeys'];

export const DEFAULT_APP_PREFERENCES: AppPreferences = appPreferencesSchema.parse({});

/** Parses any stored value into complete, valid preferences. Never throws. */
export function parseAppPreferences(value: unknown): AppPreferences {
  const isObject = typeof value === 'object' && value !== null && !Array.isArray(value);
  const parsed = appPreferencesSchema.parse(isObject ? value : {});
  // Per-field fallbacks can put two views on one key; restore the defaults
  // rather than leave a binding that silently never fires.
  const keys = new Set(CALENDAR_HOTKEY_VIEWS.map((view) => parsed.calendarHotkeys[view]));
  if (keys.size !== CALENDAR_HOTKEY_VIEWS.length) {
    return {
      ...parsed,
      calendarHotkeys: { ...DEFAULT_CALENDAR_HOTKEYS, enabled: parsed.calendarHotkeys.enabled },
    };
  }
  return parsed;
}
