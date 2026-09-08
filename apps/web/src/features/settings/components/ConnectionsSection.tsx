import styles from './SettingsView.module.css';
import { useConnections, useDisconnectConnection, useSyncConnection } from '../hooks/useSettings';

export function ConnectionsSection() {
  const connections = useConnections();
  const sync = useSyncConnection();
  const disconnect = useDisconnectConnection();

  return (
    <section className={styles.section}>
      <header>
        <div>
          <h3>Calendar connections</h3>
          <p>Client-safe status only. Provider credentials never reach the browser.</p>
        </div>
      </header>
      {connections.isLoading ? (
        <p className={styles.sectionState}>Loading connections…</p>
      ) : connections.isError ? (
        <p className={styles.sectionState}>Connection status could not load.</p>
      ) : connections.data?.length ? (
        <div className={styles.connections}>
          {connections.data.map((account) => (
            <div className={styles.connection} key={account.id}>
              <div className={styles.providerMark}>{account.provider === 'google' ? 'G' : 'M'}</div>
              <div>
                <strong>
                  {account.provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}
                </strong>
                <span>
                  {account.email ?? 'Connected account'} ·{' '}
                  {account.lastSyncAt
                    ? `synced ${relativeTime(account.lastSyncAt)}`
                    : 'waiting for first sync'}
                </span>
              </div>
              <span className={`${styles.status} ${styles[account.status]}`}>
                {account.status === 'active' ? 'Connected' : account.status}
              </span>
              <div className={styles.connectionActions}>
                <button
                  type="button"
                  onClick={() => sync.mutate(account.id)}
                  disabled={sync.isPending || account.status !== 'active'}
                >
                  Sync now
                </button>
                <button
                  type="button"
                  className={styles.dangerLink}
                  onClick={() => {
                    if (
                      confirm(
                        `Disconnect ${account.email ?? 'this account'}? Its imported calendars will be removed from BCal.`,
                      )
                    )
                      disconnect.mutate(account.id);
                  }}
                  disabled={disconnect.isPending}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.sectionState}>
          <strong>No calendar accounts connected</strong>
          <span>
            Google and Microsoft web connection setup will arrive with Web Phase 6. Existing
            accounts can be managed here.
          </span>
        </div>
      )}
    </section>
  );
}

function relativeTime(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
