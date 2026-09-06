import type { TaskList } from '@cal/schemas';
import React, { useState } from 'react';

import styles from './TaskListPane.module.css';
import { TaskRow } from './TaskRow';
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
}: TaskListPaneProps) {
  const [quickTitle, setQuickTitle] = useState('');
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const completedCount = buckets.allCompleted.length;
  const openCount = Math.max(0, allTasks.length - completedCount);

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

  const renderSection = (title: string, tasks: TaskWithTags[], isOverdue = false) => {
    if (tasks.length === 0) return null;

    return (
      <div className={styles.section} key={title}>
        <div className={styles.sectionHeader}>
          <span className={`${styles.sectionTitle} ${isOverdue ? styles.sectionTitleOverdue : ''}`}>
            {title}
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
      </div>
    );
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

      return (
        <div className={styles.sectionItems}>
          {buckets.allCompleted.map((task) => (
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
      );
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
          {renderSection('Overdue', buckets.overdue, true)}
          {renderSection('Due Today', buckets.dueToday)}
          {renderSection('Upcoming', buckets.upcoming)}
          {renderSection('No Due Date', buckets.someday)}
          {renderSection('Completed', buckets.allCompleted)}
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
        {renderSection('Overdue', buckets.overdue, true)}
        {renderSection('Due Today', buckets.dueToday)}
        {renderSection('Upcoming', buckets.upcoming)}
        {renderSection('No Due Date', buckets.someday)}
        {renderSection('Completed Today', buckets.completedToday)}
      </>
    );
  };

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <div className={styles.toolbar}>
          <div className={styles.filterTabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'inbox' ? styles.tabBtnActive : ''}`}
              onClick={() => onTabChange('inbox')}
              aria-pressed={activeTab === 'inbox'}
            >
              <span>Inbox</span>
              <span className={styles.tabCount}>{openCount}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
              onClick={() => onTabChange('all')}
              aria-pressed={activeTab === 'all'}
            >
              <span>All</span>
              <span className={styles.tabCount}>{allTasks.length}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'completed' ? styles.tabBtnActive : ''}`}
              onClick={() => onTabChange('completed')}
              aria-pressed={activeTab === 'completed'}
            >
              <span>Done</span>
              <span className={styles.tabCount}>{completedCount}</span>
            </button>
          </div>

          <div className={styles.headerActions}>
            <select
              className={styles.listSelect}
              value={selectedListId ?? ''}
              onChange={(e) => onListChange(e.target.value ? e.target.value : null)}
              aria-label="Filter by list"
            >
              <option value="">All Lists</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className={styles.newTaskBtn}
              onClick={onNewTaskClick}
              title="Create task (Inspector)"
              aria-label="Create a new task"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleQuickSubmit} className={styles.quickAddForm}>
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
            onChange={(e) => setQuickTitle(e.target.value)}
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
      </div>

      <div className={styles.listScroll}>{renderContent()}</div>
    </div>
  );
}
