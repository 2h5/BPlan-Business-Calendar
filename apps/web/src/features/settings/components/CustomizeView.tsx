import {
  type AccountMenuTrigger,
  type CalendarHotkeyView,
  type SidebarOnLaunch,
} from '@cal/schemas';
import { Link } from 'react-router-dom';

import styles from './CustomizeView.module.css';
import { HotkeyBindingRow } from './HotkeyBindingRow';
import { WorkspaceOrderList } from './WorkspaceOrderList';
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

const SIDEBAR_ON_LAUNCH_OPTIONS: { value: SidebarOnLaunch; label: string }[] = [
  { value: 'remember', label: 'Last used' },
  { value: 'open', label: 'Open' },
  { value: 'collapsed', label: 'Collapsed' },
];

export function CustomizeView() {
  const { preferences, setPreference, resetPreferences } = useAppPreferences();
  const {
    accountMenuTrigger,
    showPlanInSidebar,
    showSearchInSidebar,
    workspaceOrder,
    sidebarOnLaunch,
    calendarHotkeys,
    showEventDetails,
    showWorkingHours,
  } = preferences;

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
          <div className={styles.row}>
            <div className={styles.rowText}>
              <strong>When the app opens</strong>
              <span>Start with the sidebar as you last left it, or always open or collapsed.</span>
            </div>
            <div
              className={styles.segmented}
              role="radiogroup"
              aria-label="Sidebar when the app opens"
            >
              {SIDEBAR_ON_LAUNCH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={sidebarOnLaunch === option.value}
                  className={sidebarOnLaunch === option.value ? styles.segmentActive : ''}
                  onClick={() => setPreference('sidebarOnLaunch', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <strong id="show-search-label">Show Search</strong>
              <span>Adds Search to the Workspace section of the sidebar.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showSearchInSidebar}
              aria-labelledby="show-search-label"
              className={styles.switch}
              onClick={() => setPreference('showSearchInSidebar', !showSearchInSidebar)}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
          <div className={styles.rowText}>
            <strong>Workspace order</strong>
            <span>Drag to choose the order of your Workspace links.</span>
          </div>
          <WorkspaceOrderList
            order={workspaceOrder}
            hiddenTabs={showSearchInSidebar ? [] : ['search']}
            onChange={(next) => setPreference('workspaceOrder', next)}
          />
          <div className={styles.row}>
            <div className={styles.rowText}>
              <strong id="show-plan-label">Show Plan &amp; Pro</strong>
              <span>Your plan stays available under Plan &amp; billing in Settings.</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showPlanInSidebar}
              aria-labelledby="show-plan-label"
              className={styles.switch}
              onClick={() => setPreference('showPlanInSidebar', !showPlanInSidebar)}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="customize-calendar">
          <header>
            <h3 id="customize-calendar">Calendar</h3>
          </header>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <strong id="event-details-label">Show time and duration on events</strong>
              <span>
                In day and week view, events of 45 minutes or longer show their time range and
                length.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showEventDetails}
              aria-labelledby="event-details-label"
              className={styles.switch}
              onClick={() => setPreference('showEventDetails', !showEventDetails)}
            >
              <span className={styles.switchThumb} />
            </button>
          </div>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <strong id="working-hours-label">Shade time outside working hours</strong>
              <span>
                In day and week view, hours outside your{' '}
                <Link to="/settings" className={styles.inlineLink}>
                  working hours
                </Link>{' '}
                get a subtle hatch.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showWorkingHours}
              aria-labelledby="working-hours-label"
              className={styles.switch}
              onClick={() => setPreference('showWorkingHours', !showWorkingHours)}
            >
              <span className={styles.switchThumb} />
            </button>
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
