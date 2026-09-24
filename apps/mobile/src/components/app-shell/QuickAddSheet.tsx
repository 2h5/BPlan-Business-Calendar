import { BottomSheet, Button, Chip, Text, useTheme } from '@cal/ui';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { QuickAddTaskForm } from '../../features/tasks/components/QuickAddTaskForm';
import { useKeyboardLift } from '../../lib/keyboard';
import { useEventEditorStore } from '../../store/event-editor.store';
import { type QuickAddMode, useQuickAddStore } from '../../store/quick-add.store';

const MODES: {
  mode: QuickAddMode;
  label: string;
  icon: 'checkbox-outline' | 'calendar-outline' | 'time-outline';
}[] = [
  { mode: 'task', label: 'Task', icon: 'checkbox-outline' },
  { mode: 'event', label: 'Event', icon: 'calendar-outline' },
  { mode: 'block', label: 'Time block', icon: 'time-outline' },
];

/**
 * Quick Add is the app's fastest path from thought to captured item, so it is
 * a sheet rather than a screen — the context behind it stays visible.
 *
 * Tasks capture inline. Events hand off to the full event editor, which needs
 * a start, an end, and a calendar — there is no honest one-field version of
 * that, and a half-filled event is worse than one extra tap.
 */
export function QuickAddSheet() {
  const theme = useTheme();
  const { isOpen, mode, seedDateKey, close, handOff, setMode } = useQuickAddStore();
  const openEventEditor = useEventEditorStore((state) => state.openNew);
  const openEventEditorOnDay = useEventEditorStore((state) => state.openNewOnDay);
  // The task field focuses on open; keep "Add task" and "More options" above the keyboard.
  const { spacerStyle } = useKeyboardLift({ collapseGap: theme.spacing.lg });

  const handOffToEventEditor = () =>
    handOff(() => {
      if (seedDateKey) openEventEditorOnDay(seedDateKey);
      else openEventEditor();
    });

  return (
    <BottomSheet visible={isOpen} onClose={close} title="Quick add">
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {MODES.map((option) => (
          <Chip
            key={option.mode}
            label={option.label}
            icon={option.icon}
            selected={mode === option.mode}
            onPress={() => setMode(option.mode)}
          />
        ))}
      </View>

      {mode === 'task' ? (
        <QuickAddTaskForm onCaptured={close} onHandOff={handOff} seedDateKey={seedDateKey} />
      ) : mode === 'event' ? (
        <View style={{ gap: theme.spacing.lg }}>
          <Text variant="callout" color="secondary">
            Add a commitment with a fixed time.
          </Text>
          <Button label="New event" fullWidth onPress={handOffToEventEditor} />
        </View>
      ) : (
        <Text variant="callout" color="secondary">
          Time blocks arrive with the scheduling engine in a later sprint.
        </Text>
      )}

      <Animated.View style={spacerStyle} />
    </BottomSheet>
  );
}
