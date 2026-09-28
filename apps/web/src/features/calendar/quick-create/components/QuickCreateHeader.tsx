import { QuickCreateTypeTabs } from './QuickCreateTypeTabs';
import styles from '../QuickCreatePopover.module.css';

interface QuickCreateHeaderProps {
  isEditing: boolean;
  mode: 'event' | 'task';
  isSaving: boolean;
  showDelete: boolean;
  isDeleteConfirmOpen: boolean;
  onSelectEvent: () => void;
  onSelectTask: () => void;
  onToggleDeleteConfirm: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRequestClose: () => void;
}

export function QuickCreateHeader({
  isEditing,
  mode,
  isSaving,
  showDelete,
  isDeleteConfirmOpen,
  onSelectEvent,
  onSelectTask,
  onToggleDeleteConfirm,
  onCancelDelete,
  onConfirmDelete,
  onRequestClose,
}: QuickCreateHeaderProps) {
  return (
    <header className={styles.header}>
      {isEditing ? (
        <span className={styles.editingLabel}>Edit event</span>
      ) : (
        <QuickCreateTypeTabs
          mode={mode}
          onSelectEvent={onSelectEvent}
          onSelectTask={onSelectTask}
        />
      )}

      <div className={styles.headerRight}>
        {showDelete && (
          <div className={styles.deleteControl}>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={onToggleDeleteConfirm}
              aria-label="Delete event"
              aria-expanded={isDeleteConfirmOpen}
              aria-controls="quick-create-delete-confirm"
              title="Delete event"
              disabled={isSaving}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>

            {isDeleteConfirmOpen ? (
              <div
                id="quick-create-delete-confirm"
                className={styles.deleteConfirm}
                role="alertdialog"
                aria-label="Confirm event deletion"
              >
                <span>Delete this event?</span>
                <div className={styles.deleteConfirmActions}>
                  <button
                    type="button"
                    className={styles.deleteCancelButton}
                    onClick={onCancelDelete}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.deleteConfirmButton}
                    onClick={onConfirmDelete}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <button
          type="button"
          className={styles.closeButton}
          onClick={onRequestClose}
          aria-label="Close"
          disabled={isSaving}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  );
}
