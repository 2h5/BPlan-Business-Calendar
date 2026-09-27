import { DURATION_PRESETS, PRIORITY_LABELS } from '@cal/domain';
import type { Tag, TaskList, TaskPriority } from '@cal/schemas';
import type { Ref } from 'react';

import styles from './TaskInspector.module.css';
import { Select } from '../../../components/forms/Select';
import type { TaskInspectorForm } from '../utils/taskInspectorForm';

export interface TaskInspectorFieldsProps {
  values: TaskInspectorForm;
  titleInputRef: Ref<HTMLInputElement>;
  errorMessage: string | null;
  lists: TaskList[];
  tags: Tag[];
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onClearDue: () => void;
  onHasDueTimeChange: (value: boolean) => void;
  onDueTimeChange: (value: string) => void;
  onEstimatedMinutesChange: (value: number | null) => void;
  onPriorityChange: (value: TaskPriority) => void;
  onListChange: (value: string | null) => void;
  onTagToggle: (tagId: string) => void;
  onIsFlexibleChange: (value: boolean) => void;
}

export function TaskInspectorFields({
  values: {
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
  titleInputRef,
  errorMessage,
  lists,
  tags,
  onTitleChange,
  onDescriptionChange,
  onDueDateChange,
  onClearDue,
  onHasDueTimeChange,
  onDueTimeChange,
  onEstimatedMinutesChange,
  onPriorityChange,
  onListChange,
  onTagToggle,
  onIsFlexibleChange,
}: TaskInspectorFieldsProps) {
  return (
    <>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="task-title">
          Title
        </label>
        <input
          ref={titleInputRef}
          id="task-title"
          type="text"
          className={styles.titleInput}
          value={title}
          placeholder="What needs to be done?"
          onChange={(e) => onTitleChange(e.target.value)}
          required
          aria-invalid={!!errorMessage}
          aria-describedby={errorMessage ? 'task-form-error' : undefined}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="task-desc">
          Notes / Description
        </label>
        <textarea
          id="task-desc"
          className={styles.descriptionInput}
          value={description}
          placeholder="Add context, links, or notes..."
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>Due date &amp; time</span>
          {dueDate && (
            <button type="button" className={styles.clearFieldBtn} onClick={onClearDue}>
              Clear
            </button>
          )}
        </div>
        <div className={styles.dateTimeRow}>
          <input
            type="date"
            className={styles.dateInput}
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            aria-label="Due date"
          />
          {dueDate && (
            <label className={styles.timeToggle}>
              <input
                type="checkbox"
                checked={hasDueTime}
                onChange={(e) => onHasDueTimeChange(e.target.checked)}
              />
              <span>Time</span>
            </label>
          )}
          {dueDate && hasDueTime && (
            <input
              type="time"
              className={styles.timeInput}
              value={dueTime}
              onChange={(e) => onDueTimeChange(e.target.value)}
              aria-label="Due time"
            />
          )}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <div className={styles.fieldHeader}>
          <span className={styles.fieldLabel}>Estimated duration</span>
          {estimatedMinutes !== null && (
            <button
              type="button"
              className={styles.clearFieldBtn}
              onClick={() => onEstimatedMinutesChange(null)}
            >
              Clear
            </button>
          )}
        </div>
        <div className={styles.presetsGrid} role="group" aria-label="Estimated duration">
          {DURATION_PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`${styles.presetBtn} ${estimatedMinutes === minutes ? styles.presetBtnActive : ''}`}
              onClick={() => onEstimatedMinutesChange(minutes)}
            >
              {minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="task-priority">
          Priority
        </label>
        <Select
          id="task-priority"
          className={styles.flatSelect}
          value={priority}
          options={(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((priorityOption) => ({
            value: priorityOption,
            label: PRIORITY_LABELS[priorityOption],
          }))}
          onChange={(value) => onPriorityChange(value as TaskPriority)}
          ariaLabel="Priority"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="task-list">
          List
        </label>
        <Select
          id="task-list"
          className={styles.flatSelect}
          value={listId ?? ''}
          options={[
            { value: '', label: 'Inbox (No List)' },
            ...lists.map((list) => ({ value: list.id, label: list.name })),
          ]}
          onChange={(value) => onListChange(value || null)}
          ariaLabel="List"
        />
      </div>

      {tags.length > 0 && (
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Tags</label>
          <div className={styles.tagsGrid} role="group" aria-label="Task tags">
            {tags.map((tag) => {
              const isSelected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`${styles.tagChip} ${isSelected ? styles.tagChipSelected : ''}`}
                  onClick={() => onTagToggle(tag.id)}
                >
                  <span className={styles.tagDot} style={{ backgroundColor: tag.color }} />
                  <span>{tag.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isFlexible}
            onChange={(e) => onIsFlexibleChange(e.target.checked)}
          />
          <span>Flexible for AI scheduling</span>
        </label>
      </div>
    </>
  );
}
