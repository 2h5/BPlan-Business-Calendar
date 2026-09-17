import { CALENDAR_COLORS } from '@cal/domain';
import type { Calendar } from '@cal/schemas';
import { BottomSheet, Button, Text, TextField, useTheme } from '@cal/ui';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCreateCalendar, useUpdateCalendar } from '../../events/hooks/useCalendars';

export interface CalendarEditorSheetProps {
  visible: boolean;
  /** The calendar being edited, or null to create one. */
  calendar: Calendar | null;
  onClose: () => void;
  /** Offered for calendars that may be removed — see `CalendarsCard`. */
  onDelete?: (calendar: Calendar) => void;
}

const DEFAULT_COLOR = CALENDAR_COLORS[8]?.value ?? '#9CB9F6';

/**
 * Creates and edits a calendar: a name and a colour.
 *
 * Grouping events is the point — a Work calendar and a Personal one, each with
 * its own colour, either of which can be switched off in the views.
 */
export function CalendarEditorSheet({
  visible,
  calendar,
  onClose,
  onDelete,
}: CalendarEditorSheetProps) {
  const theme = useTheme();
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();

  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState<string | null>(null);

  // Re-seed each time the sheet opens, so a cancelled edit leaves nothing behind.
  useEffect(() => {
    if (!visible) return;
    setName(calendar?.name ?? '');
    setColor(calendar?.color ?? DEFAULT_COLOR);
    setError(null);
  }, [visible, calendar]);

  const pending = createCalendar.isPending || updateCalendar.isPending;

  const save = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return setError('Name your calendar');

    const done = { onSuccess: () => onClose() };
    if (calendar) {
      updateCalendar.mutate({ id: calendar.id, input: { name: trimmed, color } }, done);
    } else {
      createCalendar.mutate({ name: trimmed, color, isVisible: true, isDefault: false }, done);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={calendar ? 'Edit calendar' : 'New calendar'}
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={calendar ? 'Save changes' : 'Create calendar'}
            fullWidth
            loading={pending}
            onPress={save}
          />
          {calendar && onDelete ? (
            <Button
              label="Delete calendar"
              variant="destructive"
              fullWidth
              onPress={() => onDelete(calendar)}
            />
          ) : null}
        </View>
      }
    >
      <View style={{ gap: theme.spacing.lg }}>
        <TextField
          label="Name"
          value={name}
          onChangeText={(next) => {
            setName(next);
            setError(null);
          }}
          placeholder="Work, Personal, Side project…"
          autoCapitalize="words"
          error={error ?? undefined}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="footnote" color="secondary">
            Colour
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {CALENDAR_COLORS.map((option) => {
              const isSelected = color === option.value;
              // Read into a local: Reanimated's dev Babel plugin flags any
              // `x.value` inside an inline style as a shared-value misuse, and
              // `option.value` here is only a hex string.
              const swatch = option.value;

              return (
                <Pressable
                  key={swatch}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setColor(swatch)}
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

        <Text variant="footnote" color="tertiary">
          Events take their calendar&apos;s colour unless you give them one of their own.
        </Text>
      </View>
    </BottomSheet>
  );
}
