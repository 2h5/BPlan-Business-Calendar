import type { CalendarSyncHealth, ProviderAccount, ProviderKind } from '@cal/schemas';
import { useState } from 'react';

import { CalendarPickerDialog } from './CalendarPickerDialog';
import styles from './SettingsView.module.css';
import {
  useConnectProvider,
  useConnections,
  useDisconnectConnection,
  useSyncConnection,
  useSyncHealth,
} from '../hooks/useSettings';
import { deriveAccountHealthState, lastSyncAt, syncHealthLabel } from '../utils/integration-health';
import { PROVIDER_OPTIONS, providerMetadata } from '../utils/provider-metadata';

export function ConnectionsSection({ notice }: { notice?: string | null }) {
  const connections = useConnections();
  const health = useSyncHealth({ poll: true });
  const connect = useConnectProvider();
  const sync = useSyncConnection();
  const disconnect = useDisconnectConnection();
  const [pickerAccountId, setPickerAccountId] = useState<string | null>(null);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const accounts = connections.data ?? [];
  const healthRows = health.data ?? [];
  const connectedKinds = new Set(accounts.map((account) => account.provider));
  const connectableProviders = PROVIDER_OPTIONS.filter(
    (provider) => !connectedKinds.has(provider.kind),
  );
  const pickerAccount = accounts.find((account) => account.id === pickerAccountId) ?? null;

  const healthFor = (accountId: string) =>
    healthRows.filter((entry) => entry.providerAccountId === accountId);

  const startConnect = (provider: ProviderKind) => {
    setActionError(null);
    connect.mutate(provider, {
      onError: () => setActionError('Could not start the connection. Try again.'),
    });
  };

  const syncNow = (accountId: string) => {
    setActionError(null);
    setSyncingAccountId(accountId);
    sync.mutate(accountId, {
      onSettled: () => setSyncingAccountId(null),
      onError: () => setActionError('Could not start a sync. Try again.'),
    });
  };

  const disconnectAccount = (account: ProviderAccount) => {
    if (
      !confirm(
        `Disconnect ${account.email ?? 'this account'}? Its imported calendars will be removed from BCal.`,
      )
    ) {
      return;
    }

    setActionError(null);
    setDisconnectingAccountId(account.id);
    disconnect.mutate(account.id, {
      onSettled: () => setDisconnectingAccountId(null),
      onError: () => setActionError('Could not disconnect the account. Try again.'),
    });
  };

  return (
    <section className={styles.section}>
      <header>
        <div>
          <h3>Calendar connections</h3>
          <p>Client-safe status only. Provider credentials never reach the browser.</p>
        </div>
      </header>

      {notice ? (
        <p className={styles.integrationNotice} role="status">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <p className={styles.integrationError} role="alert">
          {actionError}
        </p>
      ) : null}

      {connections.isLoading ? (
        <p className={styles.sectionState}>Loading connections…</p>
      ) : connections.isError ? (
        <div className={styles.sectionState} role="alert">
          <strong>Connection status could not load.</strong>
          <span>Check your connection and try again.</span>
          <button type="button" onClick={() => void connections.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          {accounts.length === 0 ? (
            <div className={styles.sectionState}>
              <strong>No calendar accounts connected</strong>
              <span>Connect Google Calendar or Microsoft Outlook to sync selected calendars.</span>
            </div>
          ) : (
            <div className={styles.connections}>
              {accounts.map((account) => (
                <ConnectionRow
                  key={account.id}
                  account={account}
                  health={healthFor(account.id)}
                  isConnecting={connect.isPending}
                  isSyncing={sync.isPending && syncingAccountId === account.id}
                  isDisconnecting={disconnect.isPending && disconnectingAccountId === account.id}
                  onChooseCalendars={() => setPickerAccountId(account.id)}
                  onSyncNow={() => syncNow(account.id)}
                  onReconnect={() => startConnect(account.provider)}
                  onDisconnect={() => disconnectAccount(account)}
                />
              ))}
            </div>
          )}

          {connectableProviders.length > 0 ? (
            <div className={styles.connectOptions}>
              <div>
                <strong>
                  {accounts.length > 0 ? 'Connect another provider' : 'Add a provider'}
                </strong>
                <span>Choose which calendar service BCal can sync.</span>
              </div>
              <div className={styles.connectButtons}>
                {connectableProviders.map((provider) => (
                  <button
                    key={provider.kind}
                    type="button"
                    className={styles.secondary}
                    onClick={() => startConnect(provider.kind)}
                    disabled={connect.isPending}
                  >
                    <span className={styles.buttonMark} aria-hidden="true">
                      {provider.mark}
                    </span>
                    {connect.isPending ? 'Opening…' : provider.connectLabel}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {health.isError && accounts.length > 0 ? (
            <p className={styles.healthUnavailable} role="status">
              Detailed sync health is temporarily unavailable. Connection status is still current.
            </p>
          ) : null}
        </>
      )}

      <CalendarPickerDialog
        account={pickerAccount}
        health={pickerAccount ? healthFor(pickerAccount.id) : []}
        open={pickerAccount !== null}
        onClose={() => setPickerAccountId(null)}
      />
    </section>
  );
}

interface ConnectionRowProps {
  account: ProviderAccount;
  health: CalendarSyncHealth[];
  isConnecting: boolean;
  isSyncing: boolean;
  isDisconnecting: boolean;
  onChooseCalendars: () => void;
  onSyncNow: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

function ConnectionRow({
  account,
  health,
  isConnecting,
  isSyncing,
  isDisconnecting,
  onChooseCalendars,
  onSyncNow,
  onReconnect,
  onDisconnect,
}: ConnectionRowProps) {
  const provider = providerMetadata(account.provider);
  const active = account.status === 'active';
  const state = deriveAccountHealthState(account.status, health);
  const importedCount = health.filter((entry) => entry.calendarId !== null).length;
  const latestSync = [...health]
    .map(lastSyncAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  const lastSync = account.lastSyncAt ?? latestSync ?? null;

  return (
    <div className={styles.connection}>
      <div className={styles.providerMark} aria-hidden="true">
        {provider.mark}
      </div>
      <div className={styles.connectionDetails}>
        <strong>{provider.name}</strong>
        <span>{account.email ?? 'Connected account'}</span>
        <span className={styles.connectionSummary}>
          {describeAccount(account, state, importedCount, lastSync)}
        </span>
      </div>
      <span className={`${styles.status} ${styles[account.status]}`}>
        {statusLabel(account.status)}
      </span>
      <div className={styles.connectionActions}>
        {!active ? (
          <button
            type="button"
            className={styles.primaryAction}
            onClick={onReconnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Opening…' : 'Reconnect'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onChooseCalendars}
          disabled={!active}
          aria-label={`${active ? 'Manage' : 'Unavailable'} ${provider.name} calendars`}
        >
          Manage calendars
        </button>
        <button type="button" onClick={onSyncNow} disabled={!active || isSyncing}>
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button
          type="button"
          className={styles.dangerLink}
          onClick={onDisconnect}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}

function statusLabel(status: ProviderAccount['status']): string {
  if (status === 'active') return 'Connected';
  if (status === 'expired') return 'Reconnect';
  if (status === 'revoked') return 'Revoked';
  return 'Error';
}

function describeAccount(
  account: ProviderAccount,
  state: ReturnType<typeof deriveAccountHealthState>,
  importedCount: number,
  lastSync: string | null,
): string {
  if (account.status === 'expired') return 'The connection expired. Reconnect to resume syncing.';
  if (account.status === 'revoked') return 'Access was revoked. Reconnect to resume syncing.';
  if (account.status === 'error') return 'This connection needs attention. Reconnect to try again.';
  if (state === null) return 'Choose calendars to sync';
  if (state === 'synced' && lastSync) return `Synced ${relativeTime(lastSync)}`;
  if (state === 'error')
    return `${importedCount} ${plural(importedCount, 'calendar')} retrying sync`;
  return syncHealthLabel(state);
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

function relativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return 'recently';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
