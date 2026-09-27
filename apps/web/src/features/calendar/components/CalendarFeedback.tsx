import styles from './CalendarView.module.css';

export function CalendarState({
  kind,
  onRetry,
}: {
  kind: 'loading' | 'empty' | 'error';
  onRetry?: () => void;
}) {
  const copy = {
    loading: ['Loading your calendar', 'Bringing your calendars and events into view.'],
    empty: [
      'Nothing scheduled here',
      'This range is clear. Events from visible calendars will appear here.',
    ],
    error: ['We could not load your calendar', 'Check the local connection and try again.'],
  }[kind];

  return (
    <div className={styles.statePanel} role={kind === 'error' ? 'alert' : 'status'}>
      <svg
        viewBox="0 0 24 24"
        width="36"
        height="36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        {kind === 'error' ? <path d="M12 14v3M12 19h.01" /> : null}
      </svg>
      <strong>{copy[0]}</strong>
      <span>{copy[1]}</span>
      {kind === 'error' && onRetry ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

interface CalendarToastPresentationProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  isExiting: boolean;
  onHold: () => void;
  onRelease: () => void;
}

export function CalendarToastPresentation({
  message,
  actionLabel,
  onAction,
  isExiting,
  onHold,
  onRelease,
}: CalendarToastPresentationProps) {
  return (
    <div
      className={`${styles.toast} ${isExiting ? styles.toastExiting : ''}`}
      role="status"
      aria-live="polite"
      onPointerEnter={onHold}
      onPointerLeave={onRelease}
      onFocus={onHold}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onRelease();
      }}
    >
      <span className={styles.toastMessage} key={message}>
        {message === 'Restoring event…' ? (
          <span className={styles.toastSpinner} aria-hidden="true" />
        ) : null}
        <span>{message}</span>
      </span>
      {actionLabel && onAction && !isExiting ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
