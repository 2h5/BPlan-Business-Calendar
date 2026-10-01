import { toZonedDateKey } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Card, EmptyState, Text, useTheme } from '@cal/ui';
import { View } from 'react-native';

import { AGENDA_RAIL_WIDTH, AgendaDay } from './AgendaDay';
import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { formatGapRange, formatWeekOf, planAgendaRows } from '../../utils/agenda';

export interface AgendaListProps {
  dateKeys: readonly string[];
  byDateKey: Map<string, EventOccurrence[]>;
  timeZone: string;
  hourCycle: HourCycle;
  weekStartsOn: number;
  now: Date;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
}

/**
 * A chronological list down a date rail.
 *
 * Days with events get a row; runs of empty days fold into a single line
 * rather than disappearing, so a quiet stretch still reads as time passing,
 * and a divider marks each new week.
 */
export function AgendaList({
  dateKeys,
  byDateKey,
  timeZone,
  hourCycle,
  weekStartsOn,
  now,
  onPressOccurrence,
}: AgendaListProps) {
  const theme = useTheme();
  const todayKey = toZonedDateKey(now, timeZone);
  const occurrencesOn = (dateKey: string) => byDateKey.get(dateKey) ?? [];

  if (!dateKeys.some((dateKey) => occurrencesOn(dateKey).length > 0)) {
    return (
      <Card padded={false}>
        <EmptyState
          icon="calendar-outline"
          title="Nothing in the next four weeks"
          message="Events you add will appear here in order."
        />
      </Card>
    );
  }

  const rows = planAgendaRows({
    dateKeys,
    isPopulated: (dateKey) => occurrencesOn(dateKey).length > 0,
    todayKey,
    timeZone,
    weekStartsOn,
  });

  return (
    <View>
      {rows.map((row) => {
        switch (row.kind) {
          case 'day':
            return (
              <AgendaDay
                key={row.key}
                dateKey={row.dateKey}
                occurrences={occurrencesOn(row.dateKey)}
                isToday={row.dateKey === todayKey}
                now={now}
                timeZone={timeZone}
                hourCycle={hourCycle}
                onPressOccurrence={onPressOccurrence}
              />
            );

          case 'week':
            return (
              <Text
                key={row.key}
                variant="footnote"
                color="secondary"
                accessibilityRole="header"
                style={{ paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.xs }}
              >
                {formatWeekOf(row.weekStartKey)}
              </Text>
            );

          case 'gap':
            return (
              <View
                key={row.key}
                style={{
                  flexDirection: 'row',
                  gap: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderTopWidth: theme.borderWidth.hairline,
                  borderTopColor: theme.colors.borderSubtle,
                }}
              >
                <View style={{ width: AGENDA_RAIL_WIDTH }} />
                <Text variant="footnote" color="tertiary">
                  {formatGapRange(row.fromKey, row.toKey)} · Nothing scheduled
                </Text>
              </View>
            );
        }
      })}
    </View>
  );
}
