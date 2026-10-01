import { DURATION_PRESETS, formatDuration } from '@cal/domain';
import type { TaskList, TaskPriority } from '@cal/schemas';
import { Chip, Text, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  type EntryExitAnimationFunction,
  FadeIn,
  FadeOut,
  interpolateColor,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { AddTaskCardFrame } from './AddTaskCardFrame';
import { useUserTimeZone } from '../../settings/hooks/useProfile';
import { useCreateTask } from '../hooks/useTasks';
import { DUE_PRESET_LABELS, type DuePreset, resolveDuePreset } from '../utils/due-presets';

type Picker = 'date' | 'list' | 'duration' | null;

/**
 * What the priority button cycles through, one tap at a time. "Medium" saves
 * as `normal` — the same as no priority, which is the stored default — so it
 * is a capture-time label, not a level of its own.
 */
type PriorityChoice = 'none' | 'high' | 'medium' | 'low';

const NEXT_PRIORITY: Record<PriorityChoice, PriorityChoice> = {
  none: 'high',
  high: 'medium',
  medium: 'low',
  low: 'none',
};

const PRIORITY_VALUE: Record<PriorityChoice, TaskPriority> = {
  none: 'normal',
  high: 'high',
  medium: 'normal',
  low: 'low',
};

const PRIORITY_CHIP_LABEL: Record<PriorityChoice, string> = {
  none: 'Priority',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const CHANGE_MS = 180;
const EASE_OUT = Easing.out(Easing.cubic);
/** Pickers and the error fade in and out while the card resizes around them. */
const APPEAR = FadeIn.duration(CHANGE_MS);
const DISAPPEAR = FadeOut.duration(120);
/** Chips slide aside as a neighbour's label grows or shrinks. */
const SHIFT = LinearTransition.duration(CHANGE_MS).easing(EASE_OUT);

/** A chip whose value just changed settles in from slightly small and faint. */
const SETTLE: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0.4, transform: [{ scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: CHANGE_MS }),
      transform: [{ scale: withTiming(1, { duration: CHANGE_MS, easing: EASE_OUT }) }],
    },
  };
};

export interface InlineAddTaskProps {
  lists: readonly TaskList[];
  /** The list new tasks land in — whichever list the screen is filtered to. */
  defaultListId: string | null;
}

/**
 * Capture at the top of the list, where the task will appear, instead of a
 * modal. Collapsed it is one "Add a task" row; open, it is the title plus a
 * row of one-tap options. The card grows out of the row and folds back into
 * it, and every change inside it animates rather than snaps. Return adds the task and keeps the field open for
 * the next one, so a burst of captures never leaves the keyboard.
 */
export function InlineAddTask({ lists, defaultListId }: InlineAddTaskProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  // What the card grows out of and folds back into, so the swap is seamless.
  const [rowHeight, setRowHeight] = useState(44);

  // The card mounts only once opened: it needs a signed-in user to save, and
  // the list can render for a moment before the session has been restored.
  // The row's entrance is skipped on first render so the screen does not fade it in.
  return (
    <LayoutAnimationConfig skipEntering>
      {open ? (
        <AddTaskCard
          lists={lists}
          defaultListId={defaultListId}
          fromHeight={rowHeight}
          onClose={() => setOpen(false)}
        />
      ) : (
        <Animated.View entering={APPEAR}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a task"
            onPress={() => setOpen(true)}
            onLayout={(event) => setRowHeight(event.nativeEvent.layout.height)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              borderBottomWidth: theme.borderWidth.hairline,
              borderBottomColor: theme.colors.borderSubtle,
              backgroundColor: pressed ? theme.colors.hover : 'transparent',
            })}
          >
            <Ionicons name="add" size={20} color={theme.colors.accent} />
            <Text variant="callout" color="tertiary">
              Add a task
            </Text>
          </Pressable>
        </Animated.View>
      )}
    </LayoutAnimationConfig>
  );
}

function AddTaskCard({
  lists,
  defaultListId,
  fromHeight,
  onClose,
}: InlineAddTaskProps & { fromHeight: number; onClose: () => void }) {
  const theme = useTheme();
  const timeZone = useUserTimeZone();
  const createTask = useCreateTask();

  const [title, setTitle] = useState('');
  const [duePreset, setDuePreset] = useState<DuePreset>('none');
  const [priority, setPriority] = useState<PriorityChoice>('none');
  const [listId, setListId] = useState<string | null>(defaultListId);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const reset = () => {
    setTitle('');
    setDuePreset('none');
    setPriority('none');
    setListId(defaultListId);
    setEstimatedMinutes(null);
    setPicker(null);
    setError(null);
  };

  // Folds the card back into the row; `onClose` unmounts it once it has.
  const close = () => {
    Keyboard.dismiss();
    setClosing(true);
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      close();
      return;
    }

    try {
      await createTask.mutateAsync({
        title: trimmed,
        priority: PRIORITY_VALUE[priority],
        listId,
        dueAt: resolveDuePreset(duePreset, timeZone),
        hasDueTime: false,
        estimatedMinutes,
        isFlexible: true,
        tagIds: [],
      });
      reset();
    } catch {
      setError('Couldn’t save that. Try again.');
    }
  };

  const listName = lists.find((list) => list.id === listId)?.name ?? 'Inbox';
  const priorityColor: Record<PriorityChoice, string | undefined> = {
    none: undefined,
    high: theme.colors.warning,
    medium: theme.colors.accent,
    low: theme.colors.textSecondary,
  };

  return (
    <AddTaskCardFrame fromHeight={fromHeight} closing={closing} onClosed={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <PriorityRing high={priority === 'high'} />
        <TextInput
          value={title}
          onChangeText={(next) => {
            setTitle(next);
            if (error) setError(null);
          }}
          placeholder="New task"
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={() => void submit()}
          accessibilityLabel="Task title"
          style={{ flex: 1, color: theme.colors.textPrimary, fontSize: 15, paddingVertical: 2 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={10}
          onPress={close}
        >
          <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
        </Pressable>
      </View>

      {error ? (
        <Animated.View entering={APPEAR} exiting={DISAPPEAR}>
          <Text variant="footnote" style={{ color: theme.colors.danger }}>
            {error}
          </Text>
        </Animated.View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        <ChipSlot changeKey={`${duePreset}:${picker === 'date'}`}>
          <Chip
            label={duePreset === 'none' ? 'Date' : DUE_PRESET_LABELS[duePreset]}
            icon="calendar-outline"
            selected={duePreset !== 'none' || picker === 'date'}
            onPress={() => setPicker(picker === 'date' ? null : 'date')}
          />
        </ChipSlot>
        <ChipSlot changeKey={priority}>
          <Chip
            label={PRIORITY_CHIP_LABEL[priority]}
            icon="flag-outline"
            selected={priority !== 'none'}
            color={priorityColor[priority]}
            onPress={() => setPriority(NEXT_PRIORITY[priority])}
          />
        </ChipSlot>
        {lists.length > 0 ? (
          <ChipSlot changeKey={`${listId}:${picker === 'list'}`}>
            <Chip
              label={listName}
              icon="folder-outline"
              selected={picker === 'list'}
              onPress={() => setPicker(picker === 'list' ? null : 'list')}
            />
          </ChipSlot>
        ) : null}
        <ChipSlot changeKey={`${estimatedMinutes}:${picker === 'duration'}`}>
          <Chip
            label={estimatedMinutes ? formatDuration(estimatedMinutes) : 'Duration'}
            icon="time-outline"
            selected={estimatedMinutes !== null || picker === 'duration'}
            onPress={() => setPicker(picker === 'duration' ? null : 'duration')}
          />
        </ChipSlot>
      </View>

      {picker === 'date' ? (
        <OptionRow>
          {(Object.keys(DUE_PRESET_LABELS) as DuePreset[]).map((value) => (
            <Chip
              key={value}
              label={value === 'none' ? 'No date' : DUE_PRESET_LABELS[value]}
              selected={duePreset === value}
              onPress={() => {
                setDuePreset(value);
                setPicker(null);
              }}
            />
          ))}
        </OptionRow>
      ) : null}

      {picker === 'list' ? (
        <OptionRow>
          <Chip
            label="Inbox"
            icon="file-tray-outline"
            selected={listId === null}
            onPress={() => {
              setListId(null);
              setPicker(null);
            }}
          />
          {lists.map((list) => (
            <Chip
              key={list.id}
              label={list.name}
              color={list.color}
              selected={listId === list.id}
              onPress={() => {
                setListId(list.id);
                setPicker(null);
              }}
            />
          ))}
        </OptionRow>
      ) : null}

      {picker === 'duration' ? (
        <OptionRow>
          {DURATION_PRESETS.slice(0, 4).map((minutes) => (
            <Chip
              key={minutes}
              label={formatDuration(minutes)}
              selected={estimatedMinutes === minutes}
              onPress={() => {
                setEstimatedMinutes(estimatedMinutes === minutes ? null : minutes);
                setPicker(null);
              }}
            />
          ))}
        </OptionRow>
      ) : null}
    </AddTaskCardFrame>
  );
}

/**
 * Keeps a chip's place in the row animated as its neighbours resize, and
 * replays the settle whenever `changeKey` — the chip's value — changes.
 */
function ChipSlot({ changeKey, children }: { changeKey: string; children: ReactNode }) {
  return (
    <Animated.View layout={SHIFT}>
      <Animated.View key={changeKey} entering={SETTLE}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** The checkbox ring, easing to the warning colour as high priority comes and goes. */
function PriorityRing({ high }: { high: boolean }) {
  const theme = useTheme();
  const progress = useDerivedValue(() => withTiming(high ? 1 : 0, { duration: CHANGE_MS }));
  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.borderStrong, theme.colors.warning],
    ),
  }));

  return (
    <Animated.View
      style={[{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 }, ringStyle]}
    />
  );
}

function OptionRow({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={APPEAR}
      exiting={DISAPPEAR}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderTopWidth: theme.borderWidth.hairline,
        borderTopColor: theme.colors.borderSubtle,
      }}
    >
      {children}
    </Animated.View>
  );
}
