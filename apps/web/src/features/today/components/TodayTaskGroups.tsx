import type { HourCycle, TaskList } from '@cal/schemas';

import { AlertTriangleIcon, CheckIcon, ChevronDownIcon, TasksEmptyIcon } from './TodayIcons';
import { TodayTaskRow } from './TodayTaskRow';
import styles from './TodayView.module.css';
import type { TaskWithTags } from '../../tasks/api/tasks.api';

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
          {/* Overdue Section */}
          {overdue.length > 0 && (
            <div className={styles.taskSection}>
              <div className={styles.taskSectionHeaderOverdue}>
                <AlertTriangleIcon />
                <span>Overdue</span>
                <span className={styles.taskSectionBadgeOverdue}>{overdue.length}</span>
              </div>
              {overdue.map((task) => (
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
          )}

          {/* Due Today Section */}
          {dueToday.length > 0 && (
            <div className={styles.taskSection}>
              <div className={styles.taskSectionHeader}>
                <span>Due Today</span>
                <span className={styles.taskSectionBadge}>{dueToday.length}</span>
              </div>
              {dueToday.map((task) => (
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
          )}

          {/* Unscheduled / Flexible Section */}
          {unscheduled.length > 0 && (
            <div className={styles.taskSection}>
              <div className={styles.taskSectionHeader}>
                <span>Flexible Focus</span>
                <span className={styles.taskSectionBadge}>{unscheduled.length}</span>
              </div>
              {unscheduled.map((task) => (
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
          )}
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
