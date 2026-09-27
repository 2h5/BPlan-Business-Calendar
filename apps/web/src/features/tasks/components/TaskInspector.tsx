import type { CreateTaskInput, Tag, TaskList, TaskPriority, UpdateTaskInput } from '@cal/schemas';
import React, { useEffect, useRef, useState } from 'react';

import styles from './TaskInspector.module.css';
import { TaskInspectorFields } from './TaskInspectorFields';
import type { TaskWithTags } from '../api/tasks.api';
import {
  emptyTaskInspectorForm,
  inspectorFormToTaskInput,
  taskToInspectorForm,
} from '../utils/taskInspectorForm';

interface TaskInspectorProps {
  task: TaskWithTags | null;
  isDraft: boolean;
  isClosing: boolean;
  lists?: TaskList[];
  tags?: Tag[];
  timeZone: string;
  isSaving: boolean;
  onClose: () => void;
  onCloseAnimationEnd: () => void;
  onSave: (data: CreateTaskInput | UpdateTaskInput) => Promise<void> | void;
  onToggleComplete?: (task: TaskWithTags, completed: boolean) => void;
  onSnooze?: (task: TaskWithTags) => void;
  onDelete?: (task: TaskWithTags) => void;
}

export function TaskInspector({
  task,
  isDraft,
  isClosing,
  lists = [],
  tags = [],
  timeZone,
  isSaving,
  onClose,
  onCloseAnimationEnd,
  onSave,
  onToggleComplete,
  onSnooze,
  onDelete,
}: TaskInspectorProps) {
  const inspectorClassName = `${styles.inspector} ${isClosing ? styles.inspectorClosing : ''}`;
  const handleAnimationEnd = isClosing ? onCloseAnimationEnd : undefined;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [hasDueTime, setHasDueTime] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [isFlexible, setIsFlexible] = useState(true);
  const [listId, setListId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [switchAnimKey, setSwitchAnimKey] = useState<number>(0);
  const isInitialMount = useRef(true);
  const prevTaskIdRef = useRef<string | null>(task?.id ?? (isDraft ? 'draft' : null));
  const titleInputRef = useRef<HTMLInputElement>(null);
  const deleteWrapperRef = useRef<HTMLDivElement>(null);

  // Close confirmation if task selection changes
  useEffect(() => {
    setIsConfirmOpen(false);
  }, [task?.id]);

  // Click outside and escape handling for delete confirmation popup
  useEffect(() => {
    if (!isConfirmOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (!deleteWrapperRef.current?.contains(e.target as Node)) {
        setIsConfirmOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsConfirmOpen(false);
        e.stopPropagation();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isConfirmOpen]);

  // Focus title input smoothly after entry animation completes (or on mount)
  useEffect(() => {
    if (isDraft) {
      const timer = setTimeout(() => {
        titleInputRef.current?.focus({ preventScroll: true });
      }, 230);
      return () => clearTimeout(timer);
    }
  }, [isDraft]);

  // Sync state with selected task or draft and trigger switch animation when switching tasks
  useEffect(() => {
    setErrorMessage(null);
    const currentId = task?.id ?? (isDraft ? 'draft' : null);
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevTaskIdRef.current = currentId;
    } else if (currentId && prevTaskIdRef.current && currentId !== prevTaskIdRef.current) {
      setSwitchAnimKey((k) => k + 1);
      prevTaskIdRef.current = currentId;
    }

    if (task) {
      const form = taskToInspectorForm(task, timeZone);
      setTitle(form.title);
      setDescription(form.description);
      setPriority(form.priority);
      setIsFlexible(form.isFlexible);
      setListId(form.listId);
      setEstimatedMinutes(form.estimatedMinutes);
      setSelectedTagIds(form.selectedTagIds);
      setDueDate(form.dueDate);
      setDueTime(form.dueTime);
      setHasDueTime(form.hasDueTime);
    } else if (isDraft) {
      const form = emptyTaskInspectorForm();
      setTitle(form.title);
      setDescription(form.description);
      setPriority(form.priority);
      setDueDate(form.dueDate);
      setDueTime(form.dueTime);
      setHasDueTime(form.hasDueTime);
      setEstimatedMinutes(form.estimatedMinutes);
      setIsFlexible(form.isFlexible);
      setListId(form.listId);
      setSelectedTagIds(form.selectedTagIds);
    }
  }, [task, isDraft, timeZone]);

  if (!task && !isDraft) {
    return (
      <aside className={inspectorClassName} onAnimationEnd={handleAnimationEnd}>
        <div className={styles.emptyState}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p>Select a task to view details or create a new one.</p>
        </div>
      </aside>
    );
  }

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleClearDue = () => {
    setDueDate('');
    setDueTime('');
    setHasDueTime(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = inspectorFormToTaskInput(
      {
        title,
        description,
        priority,
        dueDate,
        dueTime,
        hasDueTime,
        estimatedMinutes,
        isFlexible,
        listId,
        selectedTagIds,
      },
      timeZone,
      isDraft ? undefined : task?.id,
    );
    if (!input) {
      setErrorMessage('Please enter a task title.');
      return;
    }

    try {
      setErrorMessage(null);
      if (isDraft || task) {
        await onSave(input);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save task.');
    }
  };

  const isCompleted = task?.status === 'completed';

  return (
    <aside
      className={inspectorClassName}
      aria-label="Task inspector"
      onAnimationEnd={handleAnimationEnd}
    >
      <div
        key={switchAnimKey}
        className={`${styles.inspectorInner} ${switchAnimKey > 0 ? styles.inspectorInnerSwitch : ''}`}
      >
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.headerTitle}>{isDraft ? 'New task' : 'Task details'}</span>
            <span className={styles.headerSubtitle}>
              {isDraft ? 'Capture and schedule work' : 'Edit planning details'}
            </span>
          </div>

          <div className={styles.headerActions}>
            {task && onToggleComplete && (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.completeBtn} ${isCompleted ? styles.completeBtnActive : ''}`}
                onClick={() => onToggleComplete(task, !isCompleted)}
                title={isCompleted ? 'Mark open' : 'Mark complete'}
                aria-label={isCompleted ? 'Mark open' : 'Mark complete'}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            )}

            {task && onSnooze && (
              <button
                type="button"
                className={`${styles.iconBtn} ${styles.snoozeBtn}`}
                onClick={() => onSnooze(task)}
                title="Snooze to tomorrow"
                aria-label="Snooze to tomorrow"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            )}

            <button
              type="button"
              className={`${styles.iconBtn} ${styles.closeBtn}`}
              onClick={onClose}
              title="Close inspector"
              aria-label="Close inspector"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className={styles.body}>
          {errorMessage && (
            <div id="task-form-error" className={styles.errorBanner} role="alert">
              {errorMessage}
            </div>
          )}

          <TaskInspectorFields
            values={{
              title,
              description,
              priority,
              dueDate,
              dueTime,
              hasDueTime,
              estimatedMinutes,
              isFlexible,
              listId,
              selectedTagIds,
            }}
            titleInputRef={titleInputRef}
            errorMessage={errorMessage}
            lists={lists}
            tags={tags}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onDueDateChange={setDueDate}
            onClearDue={handleClearDue}
            onHasDueTimeChange={setHasDueTime}
            onDueTimeChange={setDueTime}
            onEstimatedMinutesChange={setEstimatedMinutes}
            onPriorityChange={setPriority}
            onListChange={setListId}
            onTagToggle={handleTagToggle}
            onIsFlexibleChange={setIsFlexible}
          />

          <div className={styles.footer}>
            {task && onDelete ? (
              <div className={styles.deleteWrapper} ref={deleteWrapperRef}>
                <button
                  type="button"
                  className={`${styles.deleteBtn} ${isConfirmOpen ? styles.deleteBtnActive : ''}`}
                  onClick={() => setIsConfirmOpen((prev) => !prev)}
                  disabled={isSaving}
                  aria-expanded={isConfirmOpen}
                >
                  Delete Task
                </button>

                {isConfirmOpen && (
                  <div
                    className={styles.deleteConfirmPopup}
                    role="dialog"
                    aria-label="Confirm task deletion"
                  >
                    <div className={styles.deleteConfirmContent}>
                      <span className={styles.deleteConfirmTitle}>Delete this task?</span>
                      <span className={styles.deleteConfirmDesc}>
                        This action cannot be undone.
                      </span>
                    </div>
                    <div className={styles.deleteConfirmActions}>
                      <button
                        type="button"
                        className={styles.deleteConfirmCancelBtn}
                        onClick={() => setIsConfirmOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.deleteConfirmBtn}
                        onClick={() => {
                          setIsConfirmOpen(false);
                          onDelete(task);
                        }}
                        disabled={isSaving}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span />
            )}
            <div className={styles.footerPrimary}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button type="submit" className={styles.saveBtn} disabled={isSaving || !title.trim()}>
                {isSaving ? 'Saving…' : isDraft ? 'Create task' : 'Save changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  );
}
