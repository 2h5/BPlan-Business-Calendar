import { describeTaskDue, formatDuration, isNotablePriority, PRIORITY_LABELS } from '@cal/domain';
import type { TaskList } from '@cal/schemas';

import { CheckIcon, ClockIcon, ClockSnoozeIcon, TrashIcon } from './TodayIcons';
import styles from './TodayView.module.css';
import type { TaskWithTags } from '../../tasks/api/tasks.api';

interface TodayTaskRowProps {
  task: TaskWithTags;
  lists: TaskList[];
  now: Date;
  timeZone: string;
  hourCycle: 'h12' | 'h23';
  onOpen: (id: string) => void;
  onToggle: (task: TaskWithTags, completed: boolean) => void;
  onSnooze: (task: TaskWithTags) => void;
  onDelete: (task: TaskWithTags) => void;
}

export function TodayTaskRow({
  task,
  lists,
  now,
  timeZone,
  hourCycle,
  onOpen,
  onToggle,
  onSnooze,
  onDelete,
}: TodayTaskRowProps) {
  const isCompleted = task.status === 'completed';
  const list = lists.find((l) => l.id === task.listId);
  const dueInfo = describeTaskDue(task, { now, timeZone, hourCycle });

  return (
    <div className={`${styles.taskRow} ${isCompleted ? styles.taskRowCompleted : ''}`}>
      <button
        type="button"
        className={`${styles.taskCheckbox} ${isCompleted ? styles.taskCheckboxChecked : ''}`}
        onClick={() => onToggle(task, !isCompleted)}
        aria-label={isCompleted ? `Mark incomplete: ${task.title}` : `Complete: ${task.title}`}
      >
        {isCompleted && <CheckIcon />}
      </button>

      <button
        type="button"
        className={styles.taskContentButton}
        onClick={() => onOpen(task.id)}
        aria-label={`Open task details: ${task.title}`}
      >
        <span className={styles.taskTitle}>{task.title}</span>
        <div className={styles.taskBadges}>
          {list && (
            <span className={styles.listPill}>
              <span className={styles.listPillDot} style={{ backgroundColor: list.color }} />
              {list.name}
            </span>
          )}

          {isNotablePriority(task.priority) && (
            <span
              className={`${styles.priorityPill} ${
                task.priority === 'urgent'
                  ? styles.priorityUrgent
                  : task.priority === 'high'
                    ? styles.priorityHigh
                    : styles.priorityLow
              }`}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}

          {dueInfo.tone !== 'none' && !isCompleted && (
            <span
              className={`${styles.duePill} ${
                dueInfo.tone === 'overdue'
                  ? styles.dueOverdue
                  : dueInfo.tone === 'today'
                    ? styles.dueToday
                    : styles.dueSoon
              }`}
            >
              {dueInfo.text}
            </span>
          )}

          {task.estimatedMinutes !== null && task.estimatedMinutes > 0 && (
            <span className={styles.durationPill}>
              <ClockIcon />
              {formatDuration(task.estimatedMinutes)}
            </span>
          )}
        </div>
      </button>

      <div className={styles.taskActions}>
        <button
          type="button"
          className={styles.taskActionBtn}
          title="Snooze to tomorrow"
          onClick={() => onSnooze(task)}
        >
          <ClockSnoozeIcon />
        </button>
        <button
          type="button"
          className={`${styles.taskActionBtn} ${styles.taskActionBtnDanger}`}
          title="Delete task"
          onClick={() => onDelete(task)}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}
