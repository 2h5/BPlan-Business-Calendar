import type { TaskList } from '@cal/schemas';
import React, { useState } from 'react';

import { TaskListHeaderControls } from './TaskListHeaderControls';
import styles from './TaskListPane.module.css';
import { TaskListSection } from './TaskListSection';
import { TaskQuickAdd } from './TaskQuickAdd';
import type { TaskWithTags } from '../api/tasks.api';
import type { TaskFilter, WebTaskBuckets } from '../hooks/useTaskBuckets';

interface TaskListPaneProps {
  buckets: WebTaskBuckets;
  allTasks: TaskWithTags[];
  lists?: TaskList[];
  selectedTaskId: string | null;
  selectedListId: string | null;
  activeTab: TaskFilter;
  isLoading: boolean;
  isError: boolean;
  now: Date;
  timeZone: string;
  onTabChange: (tab: TaskFilter) => void;
  onListChange: (listId: string | null) => void;
  onSelectTask: (task: TaskWithTags) => void;
  onToggleComplete: (task: TaskWithTags, completed: boolean) => void;
  onSnooze: (task: TaskWithTags) => void;
  onDelete: (task: TaskWithTags) => void;
  onQuickAdd: (title: string) => Promise<void>;
  onNewTaskClick: () => void;
  onRetry: () => void;
  onEmptySpaceClick?: () => void;
}

export function TaskListPane({
  buckets,
  allTasks,
  lists = [],
  selectedTaskId,
  selectedListId,
  activeTab,
  isLoading,
  isError,
  now,
  timeZone,
  onTabChange,
  onListChange,
  onSelectTask,
  onToggleComplete,
  onSnooze,
  onDelete,
  onQuickAdd,
  onNewTaskClick,
  onRetry,
  onEmptySpaceClick,
}: TaskListPaneProps) {
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const completedCount = buckets.allCompleted.length;
  const openCount = Math.max(0, allTasks.length - completedCount);
  const totalTaskCount = allTasks.length;

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed) return;
    try {
      setQuickAddError(null);
      setIsQuickAdding(true);
      await onQuickAdd(trimmed);
      setQuickTitle('');
    } catch (error) {
      setQuickAddError(
        error instanceof Error ? error.message : 'Could not add the task. Try again.',
      );
    } finally {
      setIsQuickAdding(false);
    }
  };

  const sectionContext = {
    selectedTaskId,
    lists,
    now,
    timeZone,
    onSelectTask,
    onToggleComplete,
    onSnooze,
    onDelete,
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className={styles.loadingState}>Loading tasks...</div>;
    }

    if (isError) {
      return (
        <div className={styles.errorState}>
          <p>Failed to load tasks.</p>
          <button type="button" className={styles.retryBtn} onClick={onRetry}>
            Retry
          </button>
        </div>
      );
    }

    if (activeTab === 'completed') {
      if (buckets.allCompleted.length === 0) {
        return (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <h3 className={styles.emptyTitle}>No completed tasks</h3>
            <p className={styles.emptyDescription}>Tasks you complete will appear here.</p>
          </div>
        );
      }

      return <TaskListSection title="Completed" tasks={buckets.allCompleted} {...sectionContext} />;
    }

    if (activeTab === 'all') {
      if (allTasks.length === 0) {
        return (
          <div className={styles.emptyState}>
            <svg
              className={styles.emptyIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h3 className={styles.emptyTitle}>No tasks found</h3>
            <p className={styles.emptyDescription}>Add a task above to get started.</p>
          </div>
        );
      }

      return (
        <>
          <TaskListSection title="Overdue" tasks={buckets.overdue} isOverdue {...sectionContext} />
          <TaskListSection title="Due Today" tasks={buckets.dueToday} {...sectionContext} />
          <TaskListSection title="Upcoming" tasks={buckets.upcoming} {...sectionContext} />
          <TaskListSection title="No Due Date" tasks={buckets.someday} {...sectionContext} />
          <TaskListSection title="Completed" tasks={buckets.allCompleted} {...sectionContext} />
        </>
      );
    }

    // Default: 'inbox' (open tasks grouped by urgency)
    const totalOpen =
      buckets.overdue.length +
      buckets.dueToday.length +
      buckets.upcoming.length +
      buckets.someday.length;

    if (totalOpen === 0) {
      return (
        <div className={styles.emptyState}>
          <svg
            className={styles.emptyIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <h3 className={styles.emptyTitle}>Inbox Zero</h3>
          <p className={styles.emptyDescription}>
            All caught up! Type a task above to schedule what's next.
          </p>
        </div>
      );
    }

    return (
      <>
        <TaskListSection title="Overdue" tasks={buckets.overdue} isOverdue {...sectionContext} />
        <TaskListSection title="Due Today" tasks={buckets.dueToday} {...sectionContext} />
        <TaskListSection title="Upcoming" tasks={buckets.upcoming} {...sectionContext} />
        <TaskListSection title="No Due Date" tasks={buckets.someday} {...sectionContext} />
        <TaskListSection
          title="Completed Today"
          tasks={buckets.completedToday}
          {...sectionContext}
        />
      </>
    );
  };

  return (
    <div
      className={styles.pane}
      onClick={(e) => {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          !target.closest('[data-task-row]') &&
          !target.closest('button') &&
          !target.closest('input') &&
          !target.closest('select') &&
          !target.closest('textarea') &&
          !target.closest('a') &&
          !target.closest('[role="button"]') &&
          !target.closest('[role="listbox"]') &&
          !target.closest('[role="option"]')
        ) {
          onEmptySpaceClick?.();
        }
      }}
    >
      <div className={styles.header}>
        <TaskListHeaderControls
          lists={lists}
          selectedListId={selectedListId}
          activeTab={activeTab}
          openCount={openCount}
          totalTaskCount={totalTaskCount}
          completedCount={completedCount}
          onListChange={onListChange}
          onTabChange={onTabChange}
          onNewTaskClick={onNewTaskClick}
        />

        <TaskQuickAdd
          quickTitle={quickTitle}
          quickAddError={quickAddError}
          isQuickAdding={isQuickAdding}
          onTitleChange={(e) => setQuickTitle(e.target.value)}
          onSubmit={handleQuickSubmit}
        />
      </div>

      <div className={styles.listScroll}>
        {renderContent()}
        {!isLoading && !isError && activeTab === 'inbox' && openCount > 0 && (
          <div className={styles.caughtUpFooter}>
            <span className={styles.caughtUpIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="m7 12 3 3 7-7" />
              </svg>
            </span>
            <strong>All caught up?</strong>
            <span>Add a new task, or tackle what&apos;s on your list.</span>
          </div>
        )}
      </div>
    </div>
  );
}
