import type { HourCycle, Profile, WorkingHours } from '@cal/schemas';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AccountPanel } from './AccountPanel';
import { ConnectionsSection } from './ConnectionsSection';
import styles from './SettingsView.module.css';
import { Select } from '../../../components/forms/Select';
import { useAuth } from '../../auth';
import { useCalendarViewPreference } from '../../calendar/utils/calendar-preferences';
import type { CalendarViewMode } from '../../calendar/utils/calendar-window';
import { useProfile, useUpdateProfile } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { callbackResultFromNavigationState, oauthCallbackMessage } from '../utils/oauth-callback';
import { minuteOfDayToTimeInput, timeInputToMinute } from '../utils/working-hours-time';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_ZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function SettingsView() {
  const { email } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [defaultCalendarView, setDefaultCalendarView] = useCalendarViewPreference();
  const location = useLocation();
  const navigate = useNavigate();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<Profile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);
  const callbackResult = useMemo(
    () => callbackResultFromNavigationState(location.state),
    [location.state],
  );

  useEffect(() => {
    if (profile.data) setDraft(profile.data);
  }, [profile.data]);

  useEffect(() => {
    if (!callbackResult) return;
    setIntegrationMessage(oauthCallbackMessage(callbackResult));
    // Consume the transient navigation state so forward/back and refresh do
    // not replay a previous OAuth result.
    navigate(location.pathname, { replace: true, state: null });
  }, [callbackResult, location.pathname, navigate]);

  if (profile.isLoading)
    return (
      <SettingsState
        title="Loading settings"
        body="Reading your account and planning preferences."
      />
    );
  if (profile.isError || !draft)
    return (
      <SettingsState
        title="Settings could not load"
        body="Check your connection and try again."
        action={() => void profile.refetch()}
      />
    );

  const save = async () => {
    setMessage(null);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: draft.timezone }).format();
      await update.mutateAsync({
        fullName: draft.fullName,
        timezone: draft.timezone,
        weekStartsOn: draft.weekStartsOn,
        hourCycle: draft.hourCycle,
        defaultTaskMinutes: draft.defaultTaskMinutes,
        defaultEventMinutes: draft.defaultEventMinutes,
        workingHours: draft.workingHours,
      });
      setMessage('Settings saved.');
    } catch (error) {
      setMessage(
        error instanceof RangeError
          ? 'Choose a valid IANA time zone.'
          : typeof error === 'object' && error !== null && 'message' in error
            ? String(error.message)
            : 'Settings could not be saved.',
      );
    }
  };
  const updateWorking = (workingHours: WorkingHours) => setDraft({ ...draft, workingHours });
  const byDay = new Map(draft.workingHours.map((window) => [window.weekday, window]));

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h2>Settings</h2>
        <p>Account identity, time preferences, and connected calendar health.</p>
      </div>
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section}>
            <header>
              <div>
                <h3>Profile</h3>
                <p>The identity shown across your BCal workspace.</p>
              </div>
            </header>
            <div className={styles.formGrid}>
              <Field label="Full name">
                <input
                  value={draft.fullName ?? ''}
                  onChange={(e) => setDraft({ ...draft, fullName: e.target.value || null })}
                  maxLength={120}
                />
              </Field>
              <Field label="Email">
                <input value={email ?? ''} disabled />
              </Field>
            </div>
          </section>

          <section className={styles.section}>
            <header>
              <div>
                <h3>Appearance</h3>
                <p>Customize how BCal looks on your device.</p>
              </div>
            </header>
            <div className={styles.themeGrid}>
              <button
                type="button"
                className={`${styles.themeCard} ${theme === 'auto' ? styles.themeCardActive : ''}`}
                onClick={() => setTheme('auto')}
                aria-pressed={theme === 'auto'}
              >
                <div className={`${styles.themePreview} ${styles.themePreviewSystem}`}>
                  <MonitorIcon className={styles.themeIcon} />
                </div>
                <div className={styles.themeCardInfo}>
                  <div className={styles.themeCardTitleRow}>
                    <strong>System default</strong>
                    {theme === 'auto' && (
                      <span className={styles.themeCheckmark} aria-hidden="true">
                        <CheckmarkIcon />
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`${styles.themeCard} ${theme === 'light' ? styles.themeCardActive : ''}`}
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
              >
                <div className={`${styles.themePreview} ${styles.themePreviewLight}`}>
                  <SunIcon className={styles.themeIcon} />
                </div>
                <div className={styles.themeCardInfo}>
                  <div className={styles.themeCardTitleRow}>
                    <strong>Light mode</strong>
                    {theme === 'light' && (
                      <span className={styles.themeCheckmark} aria-hidden="true">
                        <CheckmarkIcon />
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                className={`${styles.themeCard} ${theme === 'dark' ? styles.themeCardActive : ''}`}
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
              >
                <div className={`${styles.themePreview} ${styles.themePreviewDark}`}>
                  <MoonIcon className={styles.themeIcon} />
                </div>
                <div className={styles.themeCardInfo}>
                  <div className={styles.themeCardTitleRow}>
                    <strong>Dark mode</strong>
                    {theme === 'dark' && (
                      <span className={styles.themeCheckmark} aria-hidden="true">
                        <CheckmarkIcon />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </div>
            <div className={styles.themeStatusRow}>
              <span>
                Currently active:{' '}
                <strong>{resolvedTheme === 'dark' ? 'Dark' : 'Light'} theme</strong>
                {theme === 'auto' ? ' (synchronized with system)' : ''}
              </span>
            </div>
          </section>

          <section className={styles.section}>
            <header className={styles.sectionHeader}>
              <div>
                <h3>Planning & Defaults</h3>
                <p>Configure scheduling behavior, default durations, and working hours.</p>
              </div>
            </header>

            {/* General Preferences Grid */}
            <div className={styles.planningSubSection}>
              <div className={styles.planningSubHeader}>
                <span className={styles.subHeaderTitle}>Time & Region</span>
                <span className={styles.subHeaderDesc}>
                  Clock format, week bounds, and base timezone
                </span>
              </div>
              <div className={styles.formGrid}>
                <Field label="Time zone">
                  <input
                    list="time-zones"
                    value={draft.timezone}
                    onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                  />
                  <datalist id="time-zones">
                    {[draft.timezone, ...TIME_ZONES]
                      .filter((v, i, a) => a.indexOf(v) === i)
                      .map((zone) => (
                        <option key={zone} value={zone} />
                      ))}
                  </datalist>
                </Field>
                <Field label="Week starts on">
                  <Select
                    value={String(draft.weekStartsOn)}
                    options={WEEKDAYS.map((day, index) => ({ value: String(index), label: day }))}
                    onChange={(value) => setDraft({ ...draft, weekStartsOn: Number(value) })}
                    ariaLabel="Week starts on"
                  />
                </Field>
                <Field label="Clock format">
                  <Select
                    value={draft.hourCycle}
                    options={[
                      { value: 'h12', label: '12-hour (9:00 AM)' },
                      { value: 'h23', label: '24-hour (09:00)' },
                    ]}
                    onChange={(value) => setDraft({ ...draft, hourCycle: value as HourCycle })}
                    ariaLabel="Clock"
                  />
                </Field>
                <Field label="Default calendar view">
                  <Select
                    value={defaultCalendarView}
                    options={[
                      { value: 'month', label: 'Month' },
                      { value: 'week', label: 'Week' },
                      { value: 'day', label: 'Day' },
                    ]}
                    onChange={(value) => setDefaultCalendarView(value as CalendarViewMode)}
                    ariaLabel="Default calendar view"
                  />
                </Field>
              </div>
            </div>

            {/* Durations Subsection */}
            <div className={styles.planningSubSection}>
              <div className={styles.planningSubHeader}>
                <span className={styles.subHeaderTitle}>Default Durations</span>
                <span className={styles.subHeaderDesc}>
                  Applied when creating new items without an explicit duration
                </span>
              </div>
              <div className={styles.formGrid}>
                <Field label="Default task duration">
                  <Select
                    value={String(draft.defaultTaskMinutes)}
                    options={[15, 30, 45, 60, 90, 120].map((minutes) => ({
                      value: String(minutes),
                      label: `${minutes} minutes`,
                    }))}
                    onChange={(value) => setDraft({ ...draft, defaultTaskMinutes: Number(value) })}
                    ariaLabel="Default task duration"
                  />
                </Field>
                <Field label="Default event duration">
                  <Select
                    value={String(draft.defaultEventMinutes)}
                    options={[15, 30, 45, 60, 90, 120].map((minutes) => ({
                      value: String(minutes),
                      label: `${minutes} minutes`,
                    }))}
                    onChange={(value) => setDraft({ ...draft, defaultEventMinutes: Number(value) })}
                    ariaLabel="Default event duration"
                  />
                </Field>
              </div>
            </div>

            {/* Working Hours Subsection */}
            <div className={styles.planningSubSection}>
              <div className={styles.workingHoursHeader}>
                <div>
                  <span className={styles.subHeaderTitle}>Working Hours</span>
                  <span className={styles.subHeaderDesc}>
                    Used to calculate open focus time and suggest meeting slots
                  </span>
                </div>
                <div className={styles.schedulePresets}>
                  <button
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => {
                      // Standard Mon-Fri 9-5
                      const monFri = [1, 2, 3, 4, 5].map((weekday) => ({
                        weekday: weekday as 1 | 2 | 3 | 4 | 5,
                        startMinute: 540,
                        endMinute: 1020,
                      }));
                      updateWorking(monFri);
                    }}
                  >
                    Mon – Fri (9 to 5)
                  </button>
                  <button
                    type="button"
                    className={styles.presetBtn}
                    onClick={() => {
                      // Clear all
                      updateWorking([]);
                    }}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className={styles.scheduleList}>
                {WEEKDAYS.map((day, weekday) => {
                  const window = byDay.get(weekday);
                  const isEnabled = !!window;
                  return (
                    <div
                      className={`${styles.scheduleRow} ${isEnabled ? styles.scheduleRowActive : ''}`}
                      key={day}
                    >
                      <div className={styles.dayCol}>
                        <label className={styles.dayCheckboxLabel}>
                          <input
                            type="checkbox"
                            className={styles.dayCheckbox}
                            checked={isEnabled}
                            onChange={(e) =>
                              updateWorking(
                                e.target.checked
                                  ? [
                                      ...draft.workingHours,
                                      {
                                        weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
                                        startMinute: 540,
                                        endMinute: 1020,
                                      },
                                    ].sort((a, b) => a.weekday - b.weekday)
                                  : draft.workingHours.filter((item) => item.weekday !== weekday),
                              )
                            }
                          />
                          <span className={styles.dayName}>{day}</span>
                        </label>
                      </div>

                      <div className={styles.timeCol}>
                        {window ? (
                          <div className={styles.timeRangeBox}>
                            <input
                              aria-label={`${day} start`}
                              type="time"
                              className={styles.timeInput}
                              value={minuteOfDayToTimeInput(window.startMinute)}
                              onChange={(e) =>
                                updateWorking(
                                  draft.workingHours.map((item) =>
                                    item.weekday === weekday
                                      ? { ...item, startMinute: timeInputToMinute(e.target.value) }
                                      : item,
                                  ),
                                )
                              }
                            />
                            <span className={styles.timeSeparator}>→</span>
                            <input
                              aria-label={`${day} end${window.endMinute === 1440 ? ' (end of day)' : ''}`}
                              type="time"
                              className={styles.timeInput}
                              value={minuteOfDayToTimeInput(window.endMinute)}
                              disabled={window.endMinute === 1440}
                              onChange={(e) =>
                                updateWorking(
                                  draft.workingHours.map((item) =>
                                    item.weekday === weekday
                                      ? { ...item, endMinute: timeInputToMinute(e.target.value) }
                                      : item,
                                  ),
                                )
                              }
                            />
                            <label className={styles.endOfDayLabel}>
                              <input
                                type="checkbox"
                                className={styles.endOfDayCheckbox}
                                checked={window.endMinute === 1440}
                                onChange={(e) =>
                                  updateWorking(
                                    draft.workingHours.map((item) =>
                                      item.weekday === weekday
                                        ? { ...item, endMinute: e.target.checked ? 1440 : 1439 }
                                        : item,
                                    ),
                                  )
                                }
                              />
                              <span>End of day</span>
                            </label>
                          </div>
                        ) : (
                          <span className={styles.offBadge}>Off</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className={styles.sectionFooter}>
              {message && (
                <span
                  className={message === 'Settings saved.' ? styles.success : styles.error}
                  role="status"
                >
                  {message}
                </span>
              )}
              <button
                type="button"
                className={styles.primary}
                onClick={() => void save()}
                disabled={update.isPending}
              >
                {update.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </section>

          <ConnectionsSection notice={integrationMessage} />
        </div>
        <AccountPanel fullName={draft.fullName} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function SettingsState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: () => void;
}) {
  return (
    <div className={styles.state} role={action ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <span>{body}</span>
      {action && (
        <button type="button" onClick={action}>
          Try again
        </button>
      )}
    </div>
  );
}

function MonitorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function CheckmarkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
