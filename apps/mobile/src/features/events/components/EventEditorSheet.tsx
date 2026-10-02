import { BottomSheet, Button, Chip, Text, TextField, useTheme } from '@cal/ui';
import { Alert, Switch, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { EventAlertPicker } from './EventAlertPicker';
import { EventColorPicker } from './EventColorPicker';
import { EventDateTimeField } from './EventDateTimeField';
import { RecurrenceField } from './RecurrenceField';
import { useKeyboardLift } from '../../../lib/keyboard';
import { useProfile, useUserTimeZone } from '../../settings/hooks/useProfile';
import { useCalendars, useDefaultCalendarId } from '../hooks/useCalendars';
import { useEventForm } from '../hooks/useEventForm';
import { useCreateEvent, useDeleteEvent, useEvent, useUpdateEvent } from '../hooks/useEvents';
import { toEventPayload, withStart } from '../utils/event-form';

/** The form's scroll height with the keyboard down, and the least it shrinks to. */
const SCROLL_MAX_HEIGHT = 470;
const MIN_SCROLL_HEIGHT = 140;

export interface EventEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  eventId: string | null;
  seedStart: Date | null;
  seedDateKey: string | null;
}

export function EventEditorSheet({
  visible,
  onClose,
  eventId,
  seedStart,
  seedDateKey,
}: EventEditorSheetProps) {
  const theme = useTheme();
  const timeZone = useUserTimeZone();
  // The sheet keeps its height when the keyboard rises: the form scrolls in
  // less space and the buttons stay above the keyboard.
  const { lift, spacerStyle } = useKeyboardLift();
  const scrollStyle = useAnimatedStyle(() => ({
    maxHeight: Math.max(MIN_SCROLL_HEIGHT, SCROLL_MAX_HEIGHT - lift.value),
  }));
  const { data: profile } = useProfile();
  const hourCycle = profile?.hourCycle ?? 'h23';

  const { data: calendars } = useCalendars();
  const defaultCalendarId = useDefaultCalendarId();
  const { data: existing } = useEvent(visible ? eventId : null);

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const removeEvent = useDeleteEvent();

  const { form, patch, error, setError } = useEventForm({
    visible,
    eventId,
    existing,
    seedStart,
    seedDateKey,
    timeZone,
    defaultCalendarId,
    defaultDurationMinutes: profile?.defaultEventMinutes ?? 60,
  });

  if (!form) return null;

  const isEditing = eventId !== null;
  const isSaving = createEvent.isPending || updateEvent.isPending;
  const selectedCalendar = calendars?.find((c) => c.id === form.calendarId);
  const isReadOnly = selectedCalendar?.isReadOnly ?? false;

  const handleSave = async () => {
    const result = toEventPayload(form, timeZone);
    if (!result.ok) return setError(result.error);

    try {
      if (isEditing) await updateEvent.mutateAsync({ id: eventId, ...result.payload });
      else await createEvent.mutateAsync(result.payload);
      onClose();
    } catch {
      setError('Could not save that. Please try again.');
    }
  };

  const handleDelete = () => {
    if (!eventId || !form.calendarId) return;
    const calendarId = form.calendarId;
    const isSeries = form.recurrenceRule !== null;

    Alert.alert(
      isSeries ? 'Delete this series?' : 'Delete event?',
      isSeries
        ? 'Every occurrence of this repeating event will be removed.'
        : 'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeEvent.mutate({ id: eventId, calendarId });
            onClose();
          },
        },
      ],
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit event' : 'New event'}
      footer={
        <>
          <View style={{ gap: theme.spacing.sm }}>
            {isReadOnly ? (
              <Text variant="footnote" color="tertiary" align="center">
                This calendar is read-only.
              </Text>
            ) : (
              <Button
                label={isEditing ? 'Save changes' : 'Add event'}
                loading={isSaving}
                fullWidth
                onPress={() => void handleSave()}
              />
            )}
            {isEditing && !isReadOnly ? (
              <Button label="Delete event" variant="ghost" fullWidth onPress={handleDelete} />
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
            patch({ title });
            if (error) setError(null);
          }}
          placeholder="What is it?"
          autoFocus={!isEditing}
          error={error ?? undefined}
        />

        <TextField
          label="Location"
          value={form.location}
          onChangeText={(location) => patch({ location })}
          placeholder="Where?"
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text variant="subhead" color="secondary">
            All day
          </Text>
          <Switch
            value={form.allDay}
            onValueChange={(allDay) => patch({ allDay })}
            trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
          />
        </View>

        <EventDateTimeField
          label="Starts"
          value={form.start}
          onChange={(start) => patch(withStart(form, start))}
          allDay={form.allDay}
          timeZone={timeZone}
          hourCycle={hourCycle}
        />

        <EventDateTimeField
          label="Ends"
          value={form.end}
          onChange={(end) => patch({ end })}
          minimumDate={form.start}
          allDay={form.allDay}
          timeZone={timeZone}
          hourCycle={hourCycle}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="secondary">
            Calendar
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {(calendars ?? []).map((calendar) => (
              <Chip
                key={calendar.id}
                label={calendar.name}
                color={calendar.color}
                selected={form.calendarId === calendar.id}
                onPress={() => patch({ calendarId: calendar.id })}
              />
            ))}
          </View>
        </View>

        <EventColorPicker
          value={form.color}
          inheritedColor={selectedCalendar?.color}
          onChange={(color) => patch({ color })}
        />

        <RecurrenceField
          value={form.recurrenceRule}
          onChange={(recurrenceRule) => patch({ recurrenceRule })}
        />

        <EventAlertPicker value={form.alerts} onChange={(alerts) => patch({ alerts })} />

        <TextField
          label="Notes"
          value={form.description}
          onChangeText={(description) => patch({ description })}
          placeholder="Anything worth remembering"
          multiline
          numberOfLines={3}
        />
      </Animated.ScrollView>
    </BottomSheet>
  );
}
