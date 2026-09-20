import type { Calendar } from '@cal/schemas';
import { Card, Checkbox, Divider, ListRow, Text, useTheme } from '@cal/ui';
import { Fragment, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { CalendarEditorSheet } from './CalendarEditorSheet';
import {
  useCalendars,
  useDeleteCalendar,
  useToggleCalendarVisibility,
} from '../../events/hooks/useCalendars';

/** What the row says about a calendar, when there is anything to say. */
function describe(calendar: Calendar): string | undefined {
  if (calendar.isReadOnly) return 'Synced — read only';
  if (calendar.isDefault) return 'New events land here';
  return undefined;
}

/**
 * Grouping events: a calendar per part of life, each with its own colour, each
 * able to be switched off across the views.
 *
 * Visibility is the calendar's own `isVisible`, which the calendar and today
 * views already respect, so switching one off follows the account rather than
 * living on one device.
 */
export function CalendarsCard() {
  const theme = useTheme();
  const { data: calendars = [] } = useCalendars();
  const toggleVisibility = useToggleCalendarVisibility();
  const deleteCalendar = useDeleteCalendar();

  /** The calendar being edited, or 'new' while creating one. */
  const [editing, setEditing] = useState<Calendar | 'new' | null>(null);
  const retainedEditing = useRef<Calendar | 'new' | null>(editing);

  if (editing) retainedEditing.current = editing;
  const activeEditing = editing ?? retainedEditing.current;

  const confirmDelete = (calendar: Calendar) =>
    Alert.alert(
      `Delete ${calendar.name}?`,
      'Everything on this calendar is deleted with it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCalendar.mutate(calendar.id);
            setEditing(null);
          },
        },
      ],
    );

  return (
    <>
      <Card eyebrow="Calendars" padded={false}>
        {calendars.map((calendar, index) => (
          <Fragment key={calendar.id}>
            {index > 0 ? <Divider inset /> : null}
            <ListRow
              title={calendar.name}
              subtitle={describe(calendar)}
              accentColor={calendar.color}
              trailing={
                <Checkbox
                  checked={calendar.isVisible}
                  color={calendar.color}
                  accessibilityLabel={`Show ${calendar.name} in the calendar`}
                  onChange={(isVisible) => toggleVisibility.mutate({ id: calendar.id, isVisible })}
                />
              }
              // A synced calendar is the provider's to rename; ours to hide.
              onPress={calendar.isReadOnly ? undefined : () => setEditing(calendar)}
              showChevron={!calendar.isReadOnly}
            />
          </Fragment>
        ))}

        {calendars.length > 0 ? <Divider inset /> : null}
        <ListRow
          title="New calendar"
          subtitle="Keep work, personal, and the rest apart"
          showChevron
          onPress={() => setEditing('new')}
        />
      </Card>

      <View style={{ paddingHorizontal: theme.spacing.xs }}>
        <Text variant="footnote" color="tertiary">
          Unticking a calendar hides its events everywhere without deleting anything.
        </Text>
      </View>

      {/* Mount after first use, then retain the editor so its close animation
          can finish before the screen eventually unmounts it. */}
      {activeEditing !== null ? (
        <CalendarEditorSheet
          visible={editing !== null}
          calendar={activeEditing === 'new' ? null : activeEditing}
          onClose={() => setEditing(null)}
          // The default calendar has to stay: new events need somewhere to land.
          onDelete={activeEditing !== 'new' && !activeEditing.isDefault ? confirmDelete : undefined}
        />
      ) : null}
    </>
  );
}
