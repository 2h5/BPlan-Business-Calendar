import type { TaskPriority } from '@cal/schemas';
import type React from 'react';

import styles from './TodayView.module.css';
import { Select, type SelectOption } from '../../../components/forms/Select';

export interface TodayQuickAddProps {
  isOpen: boolean;
  isFullyOpen: boolean;
  title: string;
  listId: string;
  priority: TaskPriority;
  isSubmitting: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  hasLists: boolean;
  listOptions: readonly SelectOption[];
  priorityOptions: readonly SelectOption[];
  onTitleChange: (title: string) => void;
  onListChange: (listId: string) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onTransitionEnd: (event: React.TransitionEvent<HTMLDivElement>) => void;
}

export function TodayQuickAdd({
  isOpen,
  isFullyOpen,
  title,
  listId,
  priority,
  isSubmitting,
  inputRef,
  hasLists,
  listOptions,
  priorityOptions,
  onTitleChange,
  onListChange,
  onPriorityChange,
  onCancel,
  onSubmit,
  onTransitionEnd,
}: TodayQuickAddProps) {
  return (
    <div
      className={`${styles.quickAddAccordion} ${isOpen ? styles.quickAddAccordionOpen : ''}`}
      onTransitionEnd={onTransitionEnd}
    >
      <div
        className={`${styles.quickAddAccordionInner} ${
          isFullyOpen ? styles.quickAddAccordionInnerOpen : ''
        }`}
      >
        <form className={styles.quickAddBox} onSubmit={onSubmit}>
          <input
            ref={inputRef}
            type="text"
            className={styles.quickAddInput}
            placeholder="What needs doing today? (Press Enter to add)"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel();
            }}
            disabled={isSubmitting}
          />
          <div className={styles.quickAddOptionsRow}>
            <div className={styles.quickAddControlsGroup}>
              {hasLists && (
                <Select
                  className={styles.quickSelect}
                  size="sm"
                  value={listId}
                  options={listOptions}
                  onChange={(val) => onListChange(val)}
                  disabled={isSubmitting}
                  ariaLabel="Task list"
                />
              )}
              <Select
                className={styles.quickSelect}
                size="sm"
                value={priority}
                options={priorityOptions}
                onChange={(val) => onPriorityChange(val as TaskPriority)}
                disabled={isSubmitting}
                ariaLabel="Task priority"
              />
            </div>

            <div className={styles.quickAddActionButtons}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={!title.trim() || isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add Task'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
