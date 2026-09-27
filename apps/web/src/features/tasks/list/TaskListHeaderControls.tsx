import type { TaskList } from '@cal/schemas';

import styles from './TaskListPane.module.css';
import { Select } from '../../../components/forms/Select';
import type { TaskFilter } from '../hooks/useTaskBuckets';

interface TaskListHeaderControlsProps {
  lists: TaskList[];
  selectedListId: string | null;
  activeTab: TaskFilter;
  openCount: number;
  totalTaskCount: number;
  completedCount: number;
  onListChange: (listId: string | null) => void;
  onTabChange: (tab: TaskFilter) => void;
  onNewTaskClick: () => void;
}

export function TaskListHeaderControls({
  lists,
  selectedListId,
  activeTab,
  openCount,
  totalTaskCount,
  completedCount,
  onListChange,
  onTabChange,
  onNewTaskClick,
}: TaskListHeaderControlsProps) {
  return (
    <>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.pageTitle}>Tasks</h1>
          <p className={styles.pageSubtitle}>Stay organized and get more done.</p>
        </div>

        <div className={styles.headerActions}>
          <Select
            className={styles.listSelect}
            size="sm"
            value={selectedListId ?? ''}
            options={[
              { value: '', label: 'All Lists' },
              ...lists.map((list) => ({ value: list.id, label: list.name })),
            ]}
            onChange={(value) => onListChange(value || null)}
            ariaLabel="Filter by list"
          />

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
            <span>New task</span>
          </button>
        </div>
      </div>

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
            <span className={styles.tabCount}>{totalTaskCount}</span>
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
      </div>
    </>
  );
}
