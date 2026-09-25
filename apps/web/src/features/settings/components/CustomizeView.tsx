import { type AccountMenuTrigger, type CalendarHotkeyView } from '@cal/schemas';
import { Link } from 'react-router-dom';

import styles from './CustomizeView.module.css';
import { HotkeyBindingRow } from './HotkeyBindingRow';
import { useAppPreferences } from '../hooks/useAppPreferences';
import { defaultCalendarHotkeys, hotkeyOwner } from '../utils/app-preferences';

const VIEW_LABELS: Record<CalendarHotkeyView, string> = {
  day: 'Day view',
  week: 'Week view',
  month: 'Month view',
};

const ACCOUNT_MENU_OPTIONS: { value: AccountMenuTrigger; label: string }[] = [
  { value: 'click', label: 'Click' },
  { value: 'hover', label: 'Hover' },
];

export function CustomizeView() {
  const { preferences, setPreference, resetPreferences } = useAppPreferences();
  const { accountMenuTrigger, calendarHotkeys } = preferences;

  // Taking a key another view already uses swaps the two, so a binding is never lost.
  const rebind = (view: CalendarHotkeyView, key: string): string | null => {
    const owner = hotkeyOwner(calendarHotkeys, key, view);
    setPreference('calendarHotkeys', {
      ...calendarHotkeys,
      [view]: key,
      ...(owner ? { [owner]: calendarHotkeys[view] } : {}),
    });
    return owner
      ? `Swapped with ${VIEW_LABELS[owner]}, now ${calendarHotkeys[view].toUpperCase()}.`
      : null;
  };

  return (
    <div className={styles.page}>
      <Link to="/settings" className={styles.backLink}>
        <ChevronLeftIcon />
        Settings
      </Link>
      <div className={styles.intro}>
        <h2>Customize</h2>
        <p>
          Fine-tune how BPlan behaves. Saved to your account, so they follow you to any browser.
        </p>
      </div>

      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="customize-sidebar">
          <header>
            <h3 id="customize-sidebar">Sidebar</h3>
          </header>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <strong>Open the account menu on</strong>
              <span>How Settings and Sign out appear from your name in the bottom-left.</span>
            </div>
            <div className={styles.segmented} role="radiogroup" aria-label="Open account menu on">
              {ACCOUNT_MENU_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={accountMenuTrigger === option.value}
                  className={accountMenuTrigger === option.value ? styles.segmentActive : ''}
                  onClick={() => setPreference('accountMenuTrigger', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="customize-keyboard">
          <header>
            <h3 id="customize-keyboard">Keyboard</h3>
          </header>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <strong id="calendar-hotkeys-label">Calendar view shortcuts</strong>
              <span>Press a single key on the Calendar to jump between day, week, and month.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={calendarHotkeys.enabled}
              aria-labelledby="calendar-hotkeys-label"
              className={styles.switch}
              onClick={() =>
                setPreference('calendarHotkeys', {
                  ...calendarHotkeys,
                  enabled: !calendarHotkeys.enabled,
                })
              }
            >
              <span className={styles.switchThumb} />
            </button>
          </div>

          {/* Always mounted so opening and closing can animate the height smoothly. */}
          <div
            className={`${styles.bindingsReveal} ${calendarHotkeys.enabled ? styles.bindingsOpen : ''}`}
            inert={!calendarHotkeys.enabled}
          >
            <div className={styles.bindings}>
              {(['day', 'week', 'month'] as const).map((view) => (
                <HotkeyBindingRow
                  key={view}
                  label={VIEW_LABELS[view]}
                  value={calendarHotkeys[view]}
                  onChange={(key) => rebind(view, key)}
                />
              ))}
              <div className={styles.bindingsFooter}>
                <span>Shortcuts pause while you type in a field or have a dialog open.</span>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => setPreference('calendarHotkeys', defaultCalendarHotkeys(true))}
                >
                  Reset to D / W / M
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.pageFooter}>
        <button type="button" className={styles.textButton} onClick={resetPreferences}>
          Reset all customizations
        </button>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
