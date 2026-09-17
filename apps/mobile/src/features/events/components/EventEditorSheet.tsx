import {
  CALENDAR_COLORS as EVENT_COLORS,
  formatDueDate,
  formatTimeOfDay,
  getZonedParts,
  zonedWallClockToUtc,
} from '@cal/domain';
import {
  BottomSheet,
  Button,
  Chip,
  DatePickerField,
  Text,
  TextField,
  TimePickerField,
  useTheme,
} from '@cal/ui';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';

import { RecurrenceField } from './RecurrenceField';
import { useProfile, useUserTimeZone } from '../../settings/hooks/useProfile';
import { useCalendars, useDefaultCalendarId } from '../hooks/useCalendars';
import { useCreateEvent, useDeleteEvent, useEvent, useUpdateEvent } from '../hooks/useEvents';

/** Alert offsets offered in the editor, in minutes before the start. */
const ALERT_PRESETS = [
  { label: 'At start', minutes: 0 },
  { label: '5 min', minutes: 5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '1 day', minutes: 1440 },
];

export interface EventEditorSheetProps {
  visible: boolean;
  onClose: () => void;
  eventId: string | null;
  seedStart: Date | null;
}

interface FormState {
  title: string;
  location: string;
  description: string;
  calendarId: string | null;
  /** NULL inherits the calendar's colour. */
  color: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  recurrenceRule: string | null;
  alerts: number[];
}

/** Round up to the next half hour — the usual case for "new event, now". */
function defaultStart(seed: Date | null): Date {
  const base = seed ?? new Date();
  if (seed) return base;
  const rounded = new Date(base);
  rounded.setMinutes(base.getMinutes() < 30 ? 30 : 60, 0, 0);
  return rounded;
}

export function EventEditorSheet({ visible, onClose, eventId, seedStart }: EventEditorSheetProps) {
  const theme = useTheme();
  const timeZone = useUserTimeZone();
  const { data: profile } = useProfile();
  const hourCycle = profile?.hourCycle ?? 'h23';
  const defaultDurationMinutes = profile?.defaultEventMinutes ?? 60;

  const { data: calendars } = useCalendars();
  const defaultCalendarId = useDefaultCalendarId();
  const { data: existing } = useEvent(visible ? eventId : null);

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const removeEvent = useDeleteEvent();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    if (!eventId) {
      const start = defaultStart(seedStart);
      setForm({
        title: '',
        location: '',
        description: '',
        calendarId: defaultCalendarId,
        color: null,
        start,
        end: new Date(start.getTime() + defaultDurationMinutes * 60_000),
        allDay: false,
        recurrenceRule: null,
        alerts: [10],
      });
      setError(null);
      return;
    }

    if (existing) {
      setForm({
        title: existing.title,
        location: existing.location ?? '',
        description: existing.description ?? '',
        calendarId: existing.calendarId,
        color: existing.color,
        start: new Date(existing.startAt),
        end: new Date(existing.endAt),
        allDay: existing.allDay,
        recurrenceRule: existing.recurrenceRule,
        alerts: existing.alerts,
      });
      setError(null);
    }
  }, [visible, eventId, existing, seedStart, defaultCalendarId, defaultDurationMinutes]);

  if (!form) return null;

  const isEditing = eventId !== null;
  const isSaving = createEvent.isPending || updateEvent.isPending;
  const selectedCalendar = calendars?.find((c) => c.id === form.calendarId);
  const isReadOnly = selectedCalendar?.isReadOnly ?? false;
  const inheritedColor = selectedCalendar?.color;

  // An event may hold a colour that is no longer in the palette — one set before
  // the palette changed, or by another client. Showing it as an extra swatch
  // keeps the current colour visible and selectable instead of silently absent.
  const swatches =
    form.color && !EVENT_COLORS.some((option) => option.value === form.color)
      ? [...EVENT_COLORS, { label: 'Current', value: form.color }]
      : EVENT_COLORS;

  const patch = (next: Partial<FormState>) =>
    setForm((previous) => (previous ? { ...previous, ...next } : previous));

  /** Moving the start drags the end with it, preserving the duration. */
  const handleStartChange = (next: Date | null) => {
    if (!next) return;
    const duration = form.end.getTime() - form.start.getTime();
    patch({ start: next, end: new Date(next.getTime() + Math.max(duration, 0)) });
  };

  const mergeDateAndTime = (day: Date, time: Date): Date => {
    const dayParts = getZonedParts(day, timeZone);
    const timeParts = getZonedParts(time, timeZone);
    return zonedWallClockToUtc(
      {
        year: dayParts.year,
        month: dayParts.month,
        day: dayParts.day,
        hour: timeParts.hour,
        minute: timeParts.minute,
      },
      timeZone,
    );
  };

  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) return setError('Give the event a title');
    if (!form.calendarId) return setError('Pick a calendar first');
    if (form.end.getTime() < form.start.getTime())
      return setError('The event ends before it starts');

    const payload = {
      calendarId: form.calendarId,
      title,
      description: form.description.trim() || null,
      location: form.location.trim() || null,
      color: form.color,
      startAt: form.start.toISOString(),
      endAt: form.end.toISOString(),
      allDay: form.allDay,
      timezone: timeZone,
      recurrenceRule: form.recurrenceRule,
      alerts: form.alerts,
    };

    try {
      if (isEditing) await updateEvent.mutateAsync({ id: eventId, ...payload });
      else await createEvent.mutateAsync(payload);
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
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 470 }}
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

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="secondary">
            Starts
          </Text>
          <DatePickerField
            value={form.start}
            onChange={(day) => day && handleStartChange(mergeDateAndTime(day, form.start))}
            format={(date) =>
              formatDueDate(date, { now: new Date(), timeZone, hourCycle, hasTime: false }).text
            }
          />
          {!form.allDay ? (
            <TimePickerField
              value={form.start}
              onChange={(time) => time && handleStartChange(mergeDateAndTime(form.start, time))}
              format={(date) => formatTimeOfDay(date, timeZone, hourCycle)}
            />
          ) : null}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="secondary">
            Ends
          </Text>
          <DatePickerField
            value={form.end}
            onChange={(day) => day && patch({ end: mergeDateAndTime(day, form.end) })}
            minimumDate={form.start}
            format={(date) =>
              formatDueDate(date, { now: new Date(), timeZone, hourCycle, hasTime: false }).text
            }
          />
          {!form.allDay ? (
            <TimePickerField
              value={form.end}
              onChange={(time) => time && patch({ end: mergeDateAndTime(form.end, time) })}
              format={(date) => formatTimeOfDay(date, timeZone, hourCycle)}
            />
          ) : null}
        </View>

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

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="secondary">
            Colour
          </Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            {/* "Inherit" is the default rather than a colour of its own, so the
                event keeps following its calendar unless asked not to. */}
            <Chip
              label="Inherit"
              color={inheritedColor}
              selected={form.color === null}
              onPress={() => patch({ color: null })}
            />

            {swatches.map((option) => {
              const isSelected = form.color === option.value;
              // Read into a local: Reanimated's dev Babel plugin flags any
              // `x.value` inside an inline style as a shared-value misuse, and
              // `option.value` here is only a hex string.
              const swatch = option.value;

              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => patch({ color: option.value })}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: swatch,
                    // The ring is drawn inside a same-coloured halo so selection
                    // reads without the swatch changing size and reflowing.
                    borderWidth: theme.borderWidth.thick,
                    borderColor: isSelected ? theme.colors.textPrimary : 'transparent',
                  }}
                />
              );
            })}
          </View>
        </View>

        <RecurrenceField
          value={form.recurrenceRule}
          onChange={(recurrenceRule) => patch({ recurrenceRule })}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subhead" color="secondary">
            Alert
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {ALERT_PRESETS.map((preset) => (
              <Chip
                key={preset.minutes}
                label={preset.label}
                selected={form.alerts.includes(preset.minutes)}
                onPress={() =>
                  patch({
                    alerts: form.alerts.includes(preset.minutes)
                      ? form.alerts.filter((minutes) => minutes !== preset.minutes)
                      : [...form.alerts, preset.minutes].sort((a, b) => a - b),
                  })
                }
              />
            ))}
          </View>
        </View>

        <TextField
          label="Notes"
          value={form.description}
          onChangeText={(description) => patch({ description })}
          placeholder="Anything worth remembering"
          multiline
          numberOfLines={3}
        />
      </ScrollView>
    </BottomSheet>
  );
}
