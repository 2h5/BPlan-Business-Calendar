import type { CreateTaskInput, TaskPriority } from '@cal/schemas';
import {
  BottomSheet,
  Button,
  SegmentedControl,
  TextField,
  useTheme,
  type SegmentedOption,
} from '@cal/ui';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { DueDateField, type DueDateValue } from './DueDateField';
import { DurationField } from './DurationField';
import { ListPicker } from './ListPicker';
import { useKeyboardLift } from '../../../lib/keyboard';
import type { TaskDraft } from '../../../store/task-editor.store';
import { RecurrenceField } from '../../events/components/RecurrenceField';
import { useProfile, useUserTimeZone } from '../../settings/hooks/useProfile';
import {
  useCreateTask,
  useDeleteTask,
  useTask,
  useTaskLists,
  useUpdateTask,
} from '../hooks/useTasks';

const PRIORITY_OPTIONS: readonly SegmentedOption<TaskPriority>[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export interface TaskEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Null creates a new task; an id edits that one. */
  taskId: string | null;
  /** Pre-selects a list when creating from inside one. */
  defaultListId?: string | null;
  /** Pre-fills a new task, e.g. from what was typed in Quick Add. */
  draft?: TaskDraft | null;
}

interface FormState {
  title: string;
  description: string;
  listId: string | null;
  priority: TaskPriority;
  due: DueDateValue;
  estimatedMinutes: number | null;
  recurrenceRule: string | null;
}

/** The form's scroll height with the keyboard down, and the least it shrinks to. */
const SCROLL_MAX_HEIGHT = 460;
const MIN_SCROLL_HEIGHT = 140;

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  listId: null,
  priority: 'normal',
  due: { dueAt: null, hasTime: false },
  estimatedMinutes: null,
  recurrenceRule: null,
};

/**
 * The full task editor. Quick Add handles the fast path; this sheet is where
 * the remaining detail lives, and it doubles as the edit surface so there is
 * only one place that knows the shape of a task form.
 */
export function TaskEditorSheet({
  visible,
  onClose,
  taskId,
  defaultListId = null,
  draft = null,
}: TaskEditorSheetProps) {
  const theme = useTheme();
  const timeZone = useUserTimeZone();
  // The sheet keeps its height when the keyboard rises: the form scrolls in
  // less space and the buttons stay above the keyboard.
  const { lift, spacerStyle } = useKeyboardLift();
  const scrollStyle = useAnimatedStyle(() => ({
    maxHeight: Math.max(MIN_SCROLL_HEIGHT, SCROLL_MAX_HEIGHT - lift.value),
  }));
  const { data: profile } = useProfile();
  const { data: lists } = useTaskLists();
  const { data: existing } = useTask(visible ? taskId : null);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  // Reload the form whenever the sheet opens or the loaded task arrives.
  useEffect(() => {
    if (!visible) return;

    if (!taskId) {
      setForm({
        ...EMPTY_FORM,
        listId: defaultListId,
        ...(draft
          ? {
              title: draft.title,
              priority: draft.priority,
              due: { dueAt: draft.dueAt ? new Date(draft.dueAt) : null, hasTime: false },
              estimatedMinutes: draft.estimatedMinutes,
            }
          : {}),
      });
      setError(null);
      return;
    }

    if (existing) {
      setForm({
        title: existing.title,
        description: existing.description ?? '',
        listId: existing.listId,
        priority: existing.priority,
        due: {
          dueAt: existing.dueAt ? new Date(existing.dueAt) : null,
          hasTime: existing.hasDueTime,
        },
        estimatedMinutes: existing.estimatedMinutes,
        recurrenceRule: existing.recurrenceRule,
      });
      setError(null);
    }
  }, [visible, taskId, existing, defaultListId, draft]);

  const isEditing = taskId !== null;
  const isSaving = createTask.isPending || updateTask.isPending;

  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) {
      setError('Give the task a title');
      return;
    }

    const payload = {
      title,
      description: form.description.trim() || null,
      listId: form.listId,
      priority: form.priority,
      dueAt: form.due.dueAt?.toISOString() ?? null,
      hasDueTime: form.due.hasTime,
      estimatedMinutes: form.estimatedMinutes,
      // A task repeats from its due date, so without one there is nothing to repeat.
      recurrenceRule: form.due.dueAt ? form.recurrenceRule : null,
    } satisfies Partial<CreateTaskInput> & { title: string };

    try {
      if (isEditing) await updateTask.mutateAsync({ id: taskId, ...payload });
      else await createTask.mutateAsync({ ...payload, isFlexible: true, tagIds: [] });
      onClose();
    } catch {
      setError('Could not save that. Please try again.');
    }
  };

  const handleDelete = () => {
    if (!taskId) return;

    Alert.alert('Delete task?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTask.mutate(taskId);
          onClose();
        },
      },
    ]);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit task' : 'New task'}
      footer={
        <>
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              label={isEditing ? 'Save changes' : 'Add task'}
              loading={isSaving}
              fullWidth
              onPress={() => void handleSave()}
            />
            {isEditing ? (
              <Button label="Delete task" variant="ghost" fullWidth onPress={handleDelete} />
            ) : null}
          </View>
          <Animated.View style={spacerStyle} />
        </>
      }
    >
      <Animated.ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={scrollStyle}
        contentContainerStyle={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.sm }}
      >
        <TextField
          label="Title"
          value={form.title}
          onChangeText={(title) => {
            setForm((previous) => ({ ...previous, title }));
            if (error) setError(null);
          }}
          placeholder="What needs doing?"
          autoFocus={!isEditing}
          returnKeyType="done"
          error={error ?? undefined}
        />

        <TextField
          label="Notes"
          value={form.description}
          onChangeText={(description) => setForm((previous) => ({ ...previous, description }))}
          placeholder="Anything worth remembering"
          multiline
          numberOfLines={3}
        />

        <SegmentedControl
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={form.priority}
          onChange={(priority) => setForm((previous) => ({ ...previous, priority }))}
        />

        <DueDateField
          value={form.due}
          onChange={(due) => setForm((previous) => ({ ...previous, due }))}
          timeZone={timeZone}
          hourCycle={profile?.hourCycle ?? 'h23'}
        />

        {form.due.dueAt ? (
          <RecurrenceField
            subject="task"
            value={form.recurrenceRule}
            onChange={(recurrenceRule) => setForm((previous) => ({ ...previous, recurrenceRule }))}
          />
        ) : null}

        <DurationField
          value={form.estimatedMinutes}
          onChange={(estimatedMinutes) =>
            setForm((previous) => ({ ...previous, estimatedMinutes }))
          }
        />

        <ListPicker
          lists={lists ?? []}
          value={form.listId}
          onChange={(listId) => setForm((previous) => ({ ...previous, listId }))}
        />
      </Animated.ScrollView>
    </BottomSheet>
  );
}
