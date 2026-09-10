import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './SettingsView.module.css';
import { deleteAccount, signOut, useAuth } from '../../auth';

export function AccountPanel({ fullName }: { fullName: string | null }) {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [dangerBusy, setDangerBusy] = useState(false);

  return (
    <aside className={styles.account}>
      <span className={styles.avatar}>{(fullName || email || 'B').slice(0, 1).toUpperCase()}</span>
      <strong>{fullName ?? 'Your account'}</strong>
      <small>{email}</small>
      <button
        type="button"
        onClick={async () => {
          await signOut();
          navigate('/login', { replace: true });
        }}
      >
        Sign out
      </button>
      <hr />
      <h3>Account data</h3>
      <p>Deleting your account removes BPlan data and revokes connected calendars.</p>
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
    </aside>
  );
}
