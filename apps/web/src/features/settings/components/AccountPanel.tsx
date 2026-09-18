import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './SettingsView.module.css';
import { deleteAccount, signOut, useAuth } from '../../auth';

export function AccountPanel({ fullName }: { fullName: string | null }) {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [dangerBusy, setDangerBusy] = useState(false);

  return (
    <section className={`${styles.section} ${styles.account}`}>
      <header>
        <div>
          <h3>Account access</h3>
          <p>Manage your session or permanently remove your BPlan account.</p>
        </div>
      </header>
      <div className={styles.accountBody}>
        <div className={styles.accountIdentity}>
          <span className={styles.avatar}>
            {(fullName || email || 'B').slice(0, 1).toUpperCase()}
          </span>
          <div className={styles.accountCopy}>
            <strong>{fullName ?? 'Your account'}</strong>
            <small>{email}</small>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/login', { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
        <div className={styles.dangerZone}>
          <div>
            <strong>Delete account</strong>
            <p>Removes all BPlan data and revokes connected calendars. This cannot be undone.</p>
          </div>
          <button
            type="button"
            className={styles.delete}
            disabled={dangerBusy}
            onClick={async () => {
              if (
                !confirm(
                  'Permanently delete your BPlan account and all of its data? This cannot be undone.',
                )
              )
                return;
              setDangerBusy(true);
              try {
                await deleteAccount();
                navigate('/login', { replace: true });
              } finally {
                setDangerBusy(false);
              }
            }}
          >
            {dangerBusy ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
    </section>
  );
}
