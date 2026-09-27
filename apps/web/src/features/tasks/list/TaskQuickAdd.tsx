import type { ChangeEventHandler, FormEventHandler } from 'react';

import styles from './TaskListPane.module.css';

interface TaskQuickAddProps {
  quickTitle: string;
  quickAddError: string | null;
  isQuickAdding: boolean;
  onTitleChange: ChangeEventHandler<HTMLInputElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function TaskQuickAdd({
  quickTitle,
  quickAddError,
  isQuickAdding,
  onTitleChange,
  onSubmit,
}: TaskQuickAddProps) {
  return (
    <>
      <form onSubmit={onSubmit} className={styles.quickAddForm}>
        <span className={styles.quickAddIcon}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </span>
        <input
          type="text"
          className={styles.quickAddInput}
          placeholder="Add task to inbox... Press Enter"
          value={quickTitle}
          disabled={isQuickAdding}
          aria-describedby={quickAddError ? 'quick-add-error' : undefined}
          aria-invalid={!!quickAddError}
          onChange={onTitleChange}
        />
        <button
          type="submit"
          className={styles.quickAddSubmit}
          disabled={isQuickAdding || !quickTitle.trim()}
        >
          {isQuickAdding ? 'Adding…' : 'Add'}
        </button>
      </form>
      {quickAddError && (
        <p id="quick-add-error" className={styles.inlineError} role="alert">
          {quickAddError}
        </p>
      )}
    </>
  );
}
