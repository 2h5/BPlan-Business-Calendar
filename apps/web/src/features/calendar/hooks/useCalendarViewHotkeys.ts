import { CALENDAR_HOTKEY_VIEWS } from '@cal/schemas';
import { useEffect, useRef } from 'react';

import { useAppPreferences } from '../../settings/hooks/useAppPreferences';
import type { CalendarViewMode } from '../utils/calendar-window';

/** True when a keypress belongs to something the user is typing into or a modal. */
export function isHotkeyBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.closest('input, textarea, select, [role="textbox"], [role="combobox"]')) return true;
  if (target.closest('[role="dialog"], [role="alertdialog"]')) return true;
  return document.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Switches calendar views on the user's configured single-key shortcuts.
 * Does nothing unless shortcuts are enabled in Settings → Customize, and stays
 * quiet while `paused` (an editor is open) so a stray key never discards edits.
 */
export function useCalendarViewHotkeys(
  onModeChange: (mode: CalendarViewMode) => void,
  paused: boolean,
) {
  const { calendarHotkeys } = useAppPreferences().preferences;
  const onModeChangeRef = useRef(onModeChange);
  onModeChangeRef.current = onModeChange;

  useEffect(() => {
    if (!calendarHotkeys.enabled || paused) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isHotkeyBlockedTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const view = CALENDAR_HOTKEY_VIEWS.find((candidate) => calendarHotkeys[candidate] === key);
      if (!view) return;

      event.preventDefault();
      onModeChangeRef.current(view);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [calendarHotkeys, paused]);
}
