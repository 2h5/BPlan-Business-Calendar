import type { HourCycle, Profile, WorkingHours } from '@cal/schemas';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AccountPanel } from './AccountPanel';
import { ConnectionsSection } from './ConnectionsSection';
import styles from './SettingsView.module.css';
import { useAuth } from '../../auth';
import { useProfile, useUpdateProfile } from '../hooks/useSettings';
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
                <h3>Planning</h3>
                <p>Shared by Today, Calendar, tasks, and the deterministic scheduling engine.</p>
              </div>
            </header>
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
                <select
                  value={draft.weekStartsOn}
                  onChange={(e) => setDraft({ ...draft, weekStartsOn: Number(e.target.value) })}
                >
                  {WEEKDAYS.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Clock">
                <select
                  value={draft.hourCycle}
                  onChange={(e) => setDraft({ ...draft, hourCycle: e.target.value as HourCycle })}
                >
                  <option value="h12">12-hour</option>
                  <option value="h23">24-hour</option>
                </select>
              </Field>
              <Field label="Default task duration">
                <select
                  value={draft.defaultTaskMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, defaultTaskMinutes: Number(e.target.value) })
                  }
                >
                  {[15, 30, 45, 60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Default event duration">
                <select
                  value={draft.defaultEventMinutes}
                  onChange={(e) =>
                    setDraft({ ...draft, defaultEventMinutes: Number(e.target.value) })
                  }
                >
                  {[15, 30, 45, 60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} minutes
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className={styles.working}>
              <h4>Working hours</h4>
              <p>Used to calculate open time and scheduling candidates.</p>
              {WEEKDAYS.map((day, weekday) => {
                const window = byDay.get(weekday);
                return (
                  <div className={styles.dayRow} key={day}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!window}
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
                      {day}
                    </label>
                    <div>
                      {window ? (
                        <>
                          <input
                            aria-label={`${day} start`}
                            type="time"
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
                          <span>to</span>
                          <input
                            aria-label={`${day} end${window.endMinute === 1440 ? ' (end of day)' : ''}`}
                            type="time"
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
                          <label className={styles.endOfDayToggle}>
                            <input
                              type="checkbox"
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
                            End of day
                          </label>
                        </>
                      ) : (
                        <span className={styles.off}>Not working</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <footer>
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
