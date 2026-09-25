import { DURATION_PRESETS, formatDuration } from '@cal/domain';
import type { TaskPriority } from '@cal/schemas';
import { Button, Chip, Text, TextField, useTheme } from '@cal/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useTaskEditorStore } from '../../../store/task-editor.store';
import { useUserTimeZone } from '../../settings/hooks/useProfile';
import { useCreateTask } from '../hooks/useTasks';
import { DUE_PRESET_LABELS, type DuePreset, resolveDuePreset } from '../utils/due-presets';

export interface QuickAddTaskFormProps {
  /** Called after a successful capture so the sheet can dismiss itself. */
  onCaptured: () => void;
  /** Closes Quick Add and runs `next`, which opens another sheet, once it has gone. */
  onHandOff: (next: () => void) => void;
  /** Set when opened from a specific day, which pre-selects a due date. */
  seedDateKey?: string | null;
}

/**
 * Quick capture. The goal is a captured thought in under five seconds, so the
 * only required input is a title — everything else is a single tap, and the
 * full editor is one tap away for anything more involved.
 */
export function QuickAddTaskForm({ onCaptured, onHandOff, seedDateKey }: QuickAddTaskFormProps) {
  const theme = useTheme();
  const timeZone = useUserTimeZone();
  const createTask = useCreateTask();
  const openEditor = useTaskEditorStore((state) => state.openNew);

  const [title, setTitle] = useState('');
  const [duePreset, setDuePreset] = useState<DuePreset>(seedDateKey ? 'today' : 'none');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveDueAt = () => resolveDuePreset(duePreset, timeZone);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give the task a title');
      return;
    }

    try {
      await createTask.mutateAsync({
        title: trimmed,
        priority,
        dueAt: resolveDueAt(),
        hasDueTime: false,
        estimatedMinutes,
        isFlexible: true,
        tagIds: [],
      });

      setTitle('');
      setDuePreset('none');
      setPriority('normal');
      setEstimatedMinutes(null);
      onCaptured();
    } catch {
      setError('Could not save that. Please try again.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <TextField
        value={title}
        onChangeText={(next) => {
          setTitle(next);
          if (error) setError(null);
        }}
        placeholder="What needs doing?"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void handleSubmit()}
        error={error ?? undefined}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="subhead" color="secondary">
          When
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {(Object.keys(DUE_PRESET_LABELS) as DuePreset[]).map((value) => (
            <Chip
              key={value}
              label={DUE_PRESET_LABELS[value]}
              selected={duePreset === value}
              onPress={() => setDuePreset(value)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="subhead" color="secondary">
          How long
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {DURATION_PRESETS.slice(0, 4).map((minutes) => (
            <Chip
              key={minutes}
              label={formatDuration(minutes)}
              selected={estimatedMinutes === minutes}
              onPress={() => setEstimatedMinutes(estimatedMinutes === minutes ? null : minutes)}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip
          label="High priority"
          icon="flag-outline"
          selected={priority === 'high' || priority === 'urgent'}
          onPress={() => setPriority(priority === 'high' ? 'normal' : 'high')}
        />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label="Add task"
          loading={createTask.isPending}
          fullWidth
          onPress={() => void handleSubmit()}
        />
        <Button
          label="More options"
          variant="ghost"
          fullWidth
          onPress={() => {
            // Whatever was typed so far carries over rather than being thrown away.
            const draft = {
              title: title.trim(),
              priority,
              dueAt: resolveDueAt(),
              estimatedMinutes,
            };
            onHandOff(() => openEditor(null, draft));
          }}
        />
      </View>
    </View>
  );
}
