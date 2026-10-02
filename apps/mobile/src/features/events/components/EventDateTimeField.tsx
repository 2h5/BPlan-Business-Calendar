import { formatDueDate, formatTimeOfDay } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { DatePickerField, Text, TimePickerField, useTheme } from '@cal/ui';
import { View } from 'react-native';

import { mergeDateAndTime } from '../utils/event-form';

export interface EventDateTimeFieldProps {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  /** All-day events pick a day only. */
  allDay: boolean;
  minimumDate?: Date;
  timeZone: string;
  hourCycle: HourCycle;
}

/**
 * One end of an event: a day picker and, unless all-day, a time picker. Each
 * picker changes only its own half — picking a day keeps the time of day, and
 * picking a time keeps the day, both read in the user's time zone.
 */
export function EventDateTimeField({
  label,
  value,
  onChange,
  allDay,
  minimumDate,
  timeZone,
  hourCycle,
}: EventDateTimeFieldProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="secondary">
        {label}
      </Text>
      <DatePickerField
        value={value}
        onChange={(day) => day && onChange(mergeDateAndTime(day, value, timeZone))}
        minimumDate={minimumDate}
        format={(date) =>
          formatDueDate(date, { now: new Date(), timeZone, hourCycle, hasTime: false }).text
        }
      />
      {!allDay ? (
        <TimePickerField
          value={value}
          onChange={(time) => time && onChange(mergeDateAndTime(value, time, timeZone))}
          format={(date) => formatTimeOfDay(date, timeZone, hourCycle)}
        />
      ) : null}
    </View>
  );
}
