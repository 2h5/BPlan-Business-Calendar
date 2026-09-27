import type { TaskList } from '@cal/schemas';

import styles from './TaskListPane.module.css';
import { TaskRow } from './TaskRow';
import type { TaskWithTags } from '../api/tasks.api';

interface TaskListSectionProps {
  title: string;
  tasks: TaskWithTags[];
  isOverdue?: boolean;
  selectedTaskId: string | null;
  lists: TaskList[];
  now: Date;
  timeZone: string;
  onSelectTask: (task: TaskWithTags) => void;
  onToggleComplete: (task: TaskWithTags, completed: boolean) => void;
  onSnooze: (task: TaskWithTags) => void;
  onDelete: (task: TaskWithTags) => void;
}

export function TaskListSection({
  title,
  tasks,
  isOverdue = false,
  selectedTaskId,
  lists,
  now,
  timeZone,
  onSelectTask,
  onToggleComplete,
  onSnooze,
  onDelete,
}: TaskListSectionProps) {
  if (tasks.length === 0) return null;

  const sectionTone = isOverdue
    ? styles.sectionOverdue
    : title === 'Due Today'
      ? styles.sectionToday
      : title === 'No Due Date'
        ? styles.sectionSomeday
        : title.startsWith('Completed')
          ? styles.sectionCompleted
          : styles.sectionUpcoming;

  const sectionIcon = isOverdue ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ) : title === 'Due Today' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  ) : title.startsWith('Completed') ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
    </svg>
  );

  return (
    <section className={`${styles.section} ${sectionTone}`} key={title}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>{sectionIcon}</span>
          <span>{title}</span>
        </span>
        <span className={styles.sectionCount}>{tasks.length}</span>
      </div>
      <div className={styles.sectionItems}>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isSelected={task.id === selectedTaskId}
            lists={lists}
            now={now}
            timeZone={timeZone}
            onSelect={onSelectTask}
            onToggleComplete={onToggleComplete}
            onSnooze={onSnooze}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}
