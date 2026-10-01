import type { HourCycle, TaskList } from '@cal/schemas';
import type { ReactNode } from 'react';

import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CrescentIcon,
  TasksEmptyIcon,
} from './TodayIcons';
import { TodayTaskRow } from './TodayTaskRow';
import styles from './TodayView.module.css';
import type { TaskWithTags } from '../../tasks/api/tasks.api';

type TodayTaskGroupKey = 'overdue' | 'dueToday' | 'unscheduled';

export interface TodayTaskGroupsProps {
  overdue: readonly TaskWithTags[];
  dueToday: readonly TaskWithTags[];
  unscheduled: readonly TaskWithTags[];
  completedToday: readonly TaskWithTags[];
  lists: TaskList[];
  now: Date;
  timeZone: string;
  hourCycle: HourCycle;
  relevantCount: number;
  isCompletedOpen: boolean;
  onToggleCompleted: () => void;
  onAddTask: () => void;
  onOpenTask: (id: string) => void;
  onToggleTask: (task: TaskWithTags, completed: boolean) => void;
  onSnoozeTask: (task: TaskWithTags) => void;
  onDeleteTask: (task: TaskWithTags) => void;
}

export function TodayTaskGroups({
  overdue,
  dueToday,
  unscheduled,
  completedToday,
  lists,
  now,
  timeZone,
  hourCycle,
  relevantCount,
  isCompletedOpen,
  onToggleCompleted,
  onAddTask,
  onOpenTask,
  onToggleTask,
  onSnoozeTask,
  onDeleteTask,
}: TodayTaskGroupsProps) {
  const groups = [
    {
      key: 'overdue',
      label: 'Overdue',
      tasks: overdue,
      icon: <AlertTriangleIcon />,
      isOverdue: true,
    },
    {
      key: 'dueToday',
      label: 'Due Today',
      tasks: dueToday,
      icon: <CalendarIcon />,
      isOverdue: false,
    },
    {
      key: 'unscheduled',
      label: 'Flexible Focus',
      tasks: unscheduled,
      icon: <CrescentIcon />,
      isOverdue: false,
    },
  ] as const satisfies readonly {
    key: TodayTaskGroupKey;
    label: string;
    tasks: readonly TaskWithTags[];
    icon: ReactNode;
    isOverdue: boolean;
  }[];

  return (
    <>
      {/* Task Groups */}
      {relevantCount === 0 ? (
        <div className={styles.emptyTasks}>
          <TasksEmptyIcon />
          <h3>No tasks for today</h3>
          <p>You have no overdue items or tasks due today.</p>
          <button type="button" className={styles.secondaryActionButton} onClick={onAddTask}>
            + Add a Task
          </button>
        </div>
      ) : (
        <div className={styles.taskGroupsList}>
          {groups.map(({ key, label, tasks, icon, isOverdue }) => {
            if (tasks.length === 0) return null;
            return (
              <div key={key} className={styles.taskSection}>
                <div
                  className={isOverdue ? styles.taskSectionHeaderOverdue : styles.taskSectionHeader}
                >
                  <span className={styles.taskSectionIcon}>{icon}</span>
                  <span>{label}</span>
                  <span
                    className={isOverdue ? styles.taskSectionBadgeOverdue : styles.taskSectionBadge}
                  >
                    {tasks.length}
                  </span>
                </div>
                <div className={styles.taskSectionRows}>
                  {tasks.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      lists={lists}
                      now={now}
                      timeZone={timeZone}
                      hourCycle={hourCycle}
                      onOpen={onOpenTask}
                      onToggle={onToggleTask}
                      onSnooze={onSnoozeTask}
                      onDelete={onDeleteTask}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Today Collapsible Section */}
      {completedToday.length > 0 && (
        <div className={styles.completedCollapsible}>
          <button
            type="button"
            className={styles.completedSummary}
            onClick={onToggleCompleted}
            aria-expanded={isCompletedOpen}
            aria-controls="completed-today-list"
          >
            <span className={styles.completedSummaryLeft}>
              <CheckIcon className={styles.checkIconGreen} />
              <span>Completed today</span>
              <span className={styles.completedCountBadge}>{completedToday.length}</span>
            </span>
            <ChevronDownIcon
              className={`${styles.chevronIcon} ${isCompletedOpen ? styles.chevronIconOpen : ''}`}
            />
          </button>
          <div
            id="completed-today-list"
            className={`${styles.completedAccordion} ${
              isCompletedOpen ? styles.completedAccordionOpen : ''
            }`}
          >
            <div className={styles.completedAccordionInner}>
              <div className={styles.completedList}>
                {completedToday.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    lists={lists}
                    now={now}
                    timeZone={timeZone}
                    hourCycle={hourCycle}
                    onOpen={onOpenTask}
                    onToggle={onToggleTask}
                    onSnooze={onSnoozeTask}
                    onDelete={onDeleteTask}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
