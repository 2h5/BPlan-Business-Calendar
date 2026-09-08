import type { CalendarSyncHealth, ProviderStatus } from '@cal/schemas';

export type SyncHealthState = 'synced' | 'waiting' | 'full_resync' | 'error' | 'reconnect';

/** Derive a safe, client-facing state from the health view's booleans only. */
export function deriveSyncHealthState(entry: CalendarSyncHealth): SyncHealthState {
  if (entry.accountStatus !== 'active') return 'reconnect';
  if (entry.hasError || entry.retryCount > 0) return 'error';
  if (entry.needsFullResync) return 'full_resync';
  if (!entry.lastFullSyncAt && !entry.lastIncrementalSyncAt) return 'waiting';
  return 'synced';
}

export function deriveAccountHealthState(
  accountStatus: ProviderStatus,
  entries: readonly CalendarSyncHealth[],
): SyncHealthState | null {
  if (accountStatus !== 'active') return 'reconnect';

  const imported = entries.filter((entry) => entry.calendarId !== null);
  if (imported.length === 0) return null;

  const states = imported.map(deriveSyncHealthState);
  if (states.includes('reconnect')) return 'reconnect';
  if (states.includes('error')) return 'error';
  if (states.includes('full_resync')) return 'full_resync';
  if (states.includes('waiting')) return 'waiting';
  return 'synced';
}

export function syncHealthLabel(state: SyncHealthState): string {
  switch (state) {
    case 'synced':
      return 'Synced';
    case 'waiting':
      return 'Waiting for first sync';
    case 'full_resync':
      return 'Full resync needed';
    case 'error':
      return 'Retrying sync';
    case 'reconnect':
      return 'Reconnect required';
  }
}

export function lastSyncAt(entry: CalendarSyncHealth): string | null {
  return entry.lastIncrementalSyncAt ?? entry.lastFullSyncAt;
}

export function lastFullSyncLabel(entry: CalendarSyncHealth): string | null {
  return entry.lastFullSyncAt ? `Full sync ${entry.lastFullSyncAt}` : null;
}

export function lastIncrementalSyncLabel(entry: CalendarSyncHealth): string | null {
  return entry.lastIncrementalSyncAt ? `Incremental sync ${entry.lastIncrementalSyncAt}` : null;
}
