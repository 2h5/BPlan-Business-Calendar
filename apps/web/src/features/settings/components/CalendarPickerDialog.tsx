import type { CalendarSyncHealth, ExternalCalendar, ProviderAccount } from '@cal/schemas';
import { useEffect, useRef, useState } from 'react';

import styles from './CalendarPickerDialog.module.css';
import { useProviderCalendars, useToggleCalendarImport } from '../hooks/useSettings';
import {
  deriveSyncHealthState,
  lastFullSyncLabel,
  lastIncrementalSyncLabel,
  syncHealthLabel,
  type SyncHealthState,
} from '../utils/integration-health';
import { providerMetadata } from '../utils/provider-metadata';

interface CalendarPickerDialogProps {
  account: ProviderAccount | null;
  health: CalendarSyncHealth[];
  open: boolean;
  onClose: () => void;
}

export function CalendarPickerDialog({
  account,
  health,
  open,
  onClose,
}: CalendarPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const calendars = useProviderCalendars(account?.id ?? null, open);
  const toggle = useToggleCalendarImport();
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && account) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) dialog.showModal();
      closeRef.current?.focus();
      return () => {
        if (dialog.open) dialog.close();
        restoreFocusRef.current?.focus();
        restoreFocusRef.current = null;
      };
    }

    if (dialog.open) dialog.close();
    restoreFocusRef.current?.focus();
    restoreFocusRef.current = null;
  }, [account, open]);

  useEffect(() => {
    if (open) return;
    setPendingIds(new Set());
    setFailedIds(new Set());
  }, [open]);

  if (!account) return null;

  const providerName = providerMetadata(account.provider).name;
  const healthByCalendarId = new Map(
    health
      .filter((entry) => entry.calendarId !== null)
      .map((entry) => [entry.calendarId as string, entry]),
  );

  const toggleImport = async (calendar: ExternalCalendar) => {
    setPendingIds((current) => addToSet(current, calendar.providerCalendarId));
    setFailedIds((current) => removeFromSet(current, calendar.providerCalendarId));

    try {
      await toggle.mutateAsync({
        providerAccountId: account.id,
        providerCalendarId: calendar.providerCalendarId,
        imported: !calendar.isImported,
      });
    } catch {
      setFailedIds((current) => addToSet(current, calendar.providerCalendarId));
    } finally {
      setPendingIds((current) => removeFromSet(current, calendar.providerCalendarId));
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="calendar-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <header className={styles.header}>
        <div>
          <h2 id="calendar-picker-title">Calendars to sync</h2>
          <p>Choose which calendars from {providerName} BPlan should import.</p>
        </div>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </header>

      <div className={styles.body}>
        {calendars.isLoading ? (
          <div className={styles.state} role="status">
            Reading your calendars…
          </div>
        ) : calendars.isError ? (
          <div className={styles.state} role="alert">
            <strong>Could not reach {providerName}</strong>
            <span>Your connection may need re-authorising.</span>
            <button type="button" onClick={() => void calendars.refetch()}>
              Try again
            </button>
          </div>
        ) : calendars.data ? (
          <div className={styles.rows}>
            {calendars.data.map((calendar) => {
              const entry = calendar.calendarId
                ? healthByCalendarId.get(calendar.calendarId)
                : undefined;
              const state = entry
                ? deriveSyncHealthState(entry)
                : calendar.isImported
                  ? 'waiting'
                  : null;
              return (
                <CalendarRow
                  key={calendar.providerCalendarId}
                  calendar={calendar}
                  health={entry}
                  state={state}
                  pending={pendingIds.has(calendar.providerCalendarId)}
                  failed={failedIds.has(calendar.providerCalendarId)}
                  onToggle={() => void toggleImport(calendar)}
                />
              );
            })}
            {calendars.data.length === 0 ? (
              <div className={styles.state}>This account has no calendars BPlan can read.</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <p>
          Turning a calendar off removes its events from BPlan. Nothing is deleted from{' '}
          {providerName}.
        </p>
      </footer>
    </dialog>
  );
}

interface CalendarRowProps {
  calendar: ExternalCalendar;
  health: CalendarSyncHealth | undefined;
  state: SyncHealthState | null;
  pending: boolean;
  failed: boolean;
  onToggle: () => void;
}

function CalendarRow({ calendar, health, state, pending, failed, onToggle }: CalendarRowProps) {
  return (
    <div className={styles.row}>
      <span
        className={styles.color}
        style={{ backgroundColor: calendar.color ?? 'var(--color-border-strong)' }}
        aria-hidden="true"
      />
      <div className={styles.details}>
        <strong className={styles.name} title={calendar.name}>
          {calendar.name}
        </strong>
        <div className={styles.meta}>
          {calendar.isPrimary ? <span>Primary</span> : null}
          {calendar.timezone ? <span>{calendar.timezone}</span> : null}
          {calendar.isReadOnly ? <span>Read-only</span> : null}
          {!calendar.isImported ? <span>Not imported</span> : null}
        </div>
        {state ? (
          <div className={`${styles.health} ${styles[stateClass(state)]}`}>
            <span>{syncHealthLabel(state)}</span>
            {health?.lastFullSyncAt ? <span>{lastFullSyncLabel(health)}</span> : null}
            {health?.lastIncrementalSyncAt ? <span>{lastIncrementalSyncLabel(health)}</span> : null}
          </div>
        ) : null}
        {failed ? (
          <span className={styles.failure} role="alert">
            Could not update this calendar. Try again.
          </span>
        ) : null}
      </div>
      <label className={styles.toggle}>
        <span className="sr-only">
          {calendar.isImported ? 'Stop importing' : 'Import'} {calendar.name}
        </span>
        <input
          type="checkbox"
          checked={calendar.isImported}
          disabled={pending}
          onChange={onToggle}
          aria-label={`${calendar.isImported ? 'Stop importing' : 'Import'} ${calendar.name}`}
        />
        <span className={styles.track} aria-hidden="true" />
      </label>
    </div>
  );
}

function stateClass(state: SyncHealthState): string {
  if (state === 'full_resync') return 'fullResync';
  return state;
}

function addToSet(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  next.add(value);
  return next;
}

function removeFromSet(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  next.delete(value);
  return next;
}
