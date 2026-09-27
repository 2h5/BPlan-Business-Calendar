import type { TaskList, TaskPriority } from '@cal/schemas';

import {
  QuickCreateDatePicker,
  QuickCreateTimePicker,
  type TimePickerOption,
} from './QuickCreatePickers';
import { Select } from '../../../../components/forms/Select';
import styles from '../QuickCreatePopover.module.css';

interface QuickCreateTaskFieldsProps {
  startDate: string;
  startDateDisplay: string;
  onStartDateChange: (value: string) => void;
  startTime: string;
  startTimeOptions: readonly TimePickerOption[];
  onStartTimeChange: (value: string) => void;
  taskHasTime: boolean;
  onTaskHasTimeChange: (checked: boolean) => void;
  taskLists: readonly TaskList[] | undefined;
  selectedListId: string;
  onSelectedListChange: (value: string) => void;
  taskPriority: TaskPriority;
  onTaskPriorityChange: (value: TaskPriority) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
}

export function QuickCreateTaskFields({
  startDate,
  startDateDisplay,
  onStartDateChange,
  startTime,
  startTimeOptions,
  onStartTimeChange,
  taskHasTime,
  onTaskHasTimeChange,
  taskLists,
  selectedListId,
  onSelectedListChange,
  taskPriority,
  onTaskPriorityChange,
  description,
  onDescriptionChange,
}: QuickCreateTaskFieldsProps) {
  return (
    <>
      {/* Task Mode Details */}
      <div className={styles.fieldRowTopAligned}>
        <span className={styles.fieldIconTop} aria-hidden="true">
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
        </span>

        <div className={styles.dateTimeContainer}>
          <div className={styles.dateTimeRow}>
            <QuickCreateDatePicker
              value={startDate}
              displayValue={startDateDisplay}
              onChange={onStartDateChange}
              ariaLabel={`Due date: ${startDateDisplay}`}
            />

            {taskHasTime ? (
              <div className={styles.timeBoxWrapper}>
                <QuickCreateTimePicker
                  value={startTime}
                  options={startTimeOptions}
                  onChange={onStartTimeChange}
                  ariaLabel="Due time"
                />
              </div>
            ) : null}
          </div>

          <div className={styles.allDayRow}>
            <label className={styles.allDayCheckbox}>
              <input
                type="checkbox"
                checked={taskHasTime}
                onChange={(e) => onTaskHasTimeChange(e.target.checked)}
              />
              <span>Set time</span>
            </label>
          </div>
        </div>
      </div>

      {/* Task List Selector */}
      {taskLists && taskLists.length > 0 && (
        <div className={styles.fieldRow}>
          <span
            className={styles.fieldIcon}
            aria-hidden="true"
            style={{
              color:
                taskLists.find((l) => l.id === (selectedListId || taskLists[0]?.id))?.color ??
                undefined,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </span>

          <div className={styles.calendarSelect}>
            <Select
              id="quick-create-task-list"
              value={selectedListId || taskLists[0]?.id || ''}
              options={taskLists.map((list) => ({
                value: list.id,
                label: list.name,
                color: list.color,
              }))}
              onChange={(val) => onSelectedListChange(val)}
              size="sm"
              ariaLabel="Choose task list"
            />
          </div>
        </div>
      )}

      {/* Priority */}
      <div className={styles.fieldRow}>
        <span className={styles.fieldIcon} aria-hidden="true">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <line x1="4" y1="22" x2="4" y2="15" />
          </svg>
        </span>

        <div className={styles.priorityGroup} role="group" aria-label="Task priority">
          {(['low', 'normal', 'high', 'urgent'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.priorityButton} ${taskPriority === p ? styles.priorityButtonActive : ''}`}
              onClick={() => onTaskPriorityChange(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Task Description (always opened by default) */}
      <div className={styles.fieldRowTopAligned}>
        <span className={styles.fieldIconTop} aria-hidden="true">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="15" y2="18" />
          </svg>
        </span>
        <textarea
          className={styles.textareaInput}
          placeholder="Add description"
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          aria-label="Description"
        />
      </div>
    </>
  );
}
