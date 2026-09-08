import { describeTaskDue, formatDuration, isNotablePriority, PRIORITY_LABELS } from '@cal/domain';
import type { TaskList } from '@cal/schemas';
import React, { memo, useEffect, useRef, useState } from 'react';

import styles from './TaskRow.module.css';
import type { TaskWithTags } from '../api/tasks.api';

interface TaskRowProps {
  task: TaskWithTags;
  isSelected: boolean;
  lists?: TaskList[];
  now: Date;
  timeZone: string;
  hourCycle?: 'h12' | 'h23';
  onSelect: (task: TaskWithTags) => void;
  onToggleComplete: (task: TaskWithTags, completed: boolean) => void;
  onSnooze: (task: TaskWithTags) => void;
  onDelete: (task: TaskWithTags) => void;
}

export const TaskRow = memo(function TaskRow({
  task,
  isSelected,
  lists,
  now,
  timeZone,
  hourCycle = 'h23',
  onSelect,
  onToggleComplete,
  onSnooze,
  onDelete,
}: TaskRowProps) {
  const isCompleted = task.status === 'completed';
  const [isExiting, setIsExiting] = useState<
    'completing' | 'uncompleting' | 'deleting' | 'snoozing' | null
  >(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  const effectiveCompleted =
    isExiting === 'completing' ? true : isExiting === 'uncompleting' ? false : isCompleted;

  const dueInfo = describeTaskDue(task, { now, timeZone, hourCycle });
  const list = lists?.find((l) => l.id === task.listId);

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExiting) return;

    if (!isCompleted) {
      setIsExiting('completing');
      exitTimerRef.current = setTimeout(() => {
        onToggleComplete(task, true);
      }, 260);
    } else {
      setIsExiting('uncompleting');
      exitTimerRef.current = setTimeout(() => {
        onToggleComplete(task, false);
      }, 260);
    }
  };

  const handleSnoozeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExiting) return;

    setIsExiting('snoozing');
    exitTimerRef.current = setTimeout(() => {
      onSnooze(task);
    }, 260);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExiting) return;

    setIsExiting('deleting');
    exitTimerRef.current = setTimeout(() => {
      onDelete(task);
    }, 260);
  };

  const priorityClass =
    task.priority === 'urgent'
      ? styles.priorityUrgent
      : task.priority === 'high'
        ? styles.priorityHigh
        : task.priority === 'low'
          ? styles.priorityLow
          : styles.priorityNormal;

  const dueClass =
    dueInfo.tone === 'overdue'
      ? styles.dueOverdue
      : dueInfo.tone === 'today'
        ? styles.dueToday
        : dueInfo.tone === 'soon'
          ? styles.dueSoon
          : styles.dueLater;

  const exitClass =
    isExiting === 'completing'
      ? styles.rowCompletingExit
      : isExiting === 'uncompleting'
        ? styles.rowUncompletingExit
        : isExiting === 'deleting'
          ? styles.rowDeletingExit
          : isExiting === 'snoozing'
            ? styles.rowSnoozingExit
            : '';

  return (
    <div
      data-task-row="true"
      className={`${styles.row} ${isSelected ? styles.rowSelected : ''} ${
        effectiveCompleted ? styles.rowCompleted : ''
      } ${exitClass}`}
    >
      <button
        type="button"
        className={`${styles.checkboxBtn} ${effectiveCompleted ? styles.checkboxChecked : ''}`}
        onClick={handleCheckboxClick}
        title={effectiveCompleted ? 'Mark open' : 'Mark complete'}
        aria-label={effectiveCompleted ? 'Mark open' : 'Mark complete'}
      >
        {effectiveCompleted && (
          <svg
            className={styles.checkboxCheckmark}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className={styles.content}
        onClick={() => onSelect(task)}
        aria-label={`Open task: ${task.title}`}
      >
        <div className={styles.mainLine}>
          <span className={styles.title}>{task.title}</span>
        </div>

        <div className={styles.metaLine}>
          {isNotablePriority(task.priority) && (
            <span className={`${styles.badge} ${priorityClass}`}>
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}

          {dueInfo.tone !== 'none' && (
            <span className={`${styles.badge} ${dueClass}`}>{dueInfo.text}</span>
          )}

          {task.estimatedMinutes !== null && task.estimatedMinutes > 0 && (
            <span className={`${styles.badge} ${styles.durationBadge}`}>
              {formatDuration(task.estimatedMinutes)}
            </span>
          )}

          {list && (
            <span className={styles.listBadge}>
              <span className={styles.listDot} style={{ backgroundColor: list.color }} />
              <span>{list.name}</span>
            </span>
          )}

          {!task.isFlexible && (
            <span
              className={`${styles.badge} ${styles.fixedBadge}`}
              title="Fixed time; AI scheduler won't move"
            >
              Fixed
            </span>
          )}
        </div>
      </button>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleSnoozeClick}
          title="Snooze to tomorrow"
          aria-label="Snooze to tomorrow"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>

        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
          onClick={handleDeleteClick}
          title="Delete task"
          aria-label="Delete task"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
});
