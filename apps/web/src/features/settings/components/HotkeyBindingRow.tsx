import { useState } from 'react';

import styles from './CustomizeView.module.css';
import { toHotkey } from '../utils/app-preferences';

interface HotkeyBindingRowProps {
  label: string;
  value: string;
  /** Returns a note to show after the change (for example a swap), or null. */
  onChange: (key: string) => string | null;
}

/**
 * One rebindable shortcut. Click "Change", press a letter or number, done.
 * Escape or clicking away cancels without changing anything.
 */
export function HotkeyBindingRow({ label, value, onChange }: HotkeyBindingRowProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isRecording) return;
    if (event.key === 'Tab') {
      setIsRecording(false);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setIsRecording(false);
      setMessage(null);
      return;
    }
    // Ignore lone modifier presses while the user reaches for a key.
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;

    const key = event.ctrlKey || event.metaKey || event.altKey ? null : toHotkey(event.key);
    if (!key) {
      setMessage({ tone: 'error', text: 'Use a single letter or number, without modifiers.' });
      return;
    }
    const note = onChange(key);
    setMessage(note ? { tone: 'info', text: note } : null);
    setIsRecording(false);
  };

  return (
    <div className={styles.bindingRow}>
      <div className={styles.bindingLabel}>
        <span>{label}</span>
        {message && (
          <span
            className={message.tone === 'error' ? styles.bindingError : styles.bindingNote}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </span>
        )}
      </div>
      <button
        type="button"
        className={`${styles.keycapButton} ${isRecording ? styles.keycapRecording : ''}`}
        onClick={() => {
          setMessage(null);
          setIsRecording((recording) => !recording);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setIsRecording(false)}
        aria-label={
          isRecording ? `Press a key for ${label}` : `${label} shortcut: ${value.toUpperCase()}`
        }
      >
        {isRecording ? (
          <span className={styles.keycapPrompt}>Press a key…</span>
        ) : (
          <>
            <kbd className={styles.keycap}>{value.toUpperCase()}</kbd>
            <span className={styles.keycapAction}>Change</span>
          </>
        )}
      </button>
    </div>
  );
}
