import { findConflictingItems, formatTimeOfDay } from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Fragment } from 'react';
import { View } from 'react-native';

import { AgendaEventRow } from './AgendaEventRow';
import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import {
  describeTiming,
  formatDayLong,
  formatWeekdayShort,
  nowLineIndex,
} from '../../utils/agenda';
import { dateKeyToInstant, shiftDateKey } from '../../utils/window';

/** Width of the date rail; gap lines indent by the same amount. */
export const AGENDA_RAIL_WIDTH = 40;

export interface AgendaDayProps {
  dateKey: string;
  occurrences: readonly EventOccurrence[];
  isToday: boolean;
  now: Date;
  timeZone: string;
  hourCycle: HourCycle;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
}

/**
 * One day of the agenda: the date down a rail on the left, the day's events
 * beside it. All-day events lead; timed events follow, with today's split by
 * a current-time line and anything that overlaps marked.
 */
export function AgendaDay({
  dateKey,
  occurrences,
  isToday,
  now,
  timeZone,
  hourCycle,
  onPressOccurrence,
}: AgendaDayProps) {
  const theme = useTheme();
  const dayStart = dateKeyToInstant(dateKey, timeZone).getTime();
  // The next local midnight, not +24h: a DST day is 23 or 25 hours long.
  const dayEnd = dateKeyToInstant(shiftDateKey(dateKey, 1, timeZone), timeZone).getTime();
  const nowMs = now.getTime();

  const rows = occurrences.map((occurrence) => ({
    occurrence,
    timing: describeTiming(
      { start: occurrence.start, end: occurrence.end, allDay: occurrence.event.allDay },
      dayStart,
      dayEnd,
      timeZone,
      hourCycle,
    ),
  }));
  const allDay = rows.filter((row) => row.timing.fillsDay);
  const timed = rows.filter((row) => !row.timing.fillsDay);

  const conflicts = findConflictingItems(timed, ({ occurrence }) =>
    occurrence.event.status === 'cancelled'
      ? null
      : { start: occurrence.start, end: occurrence.end },
  );
  const nowIndex = isToday
    ? nowLineIndex(
        timed.map((row) => row.occurrence),
        nowMs,
      )
    : -1;

  const renderRow = (row: (typeof rows)[number]) => (
    <AgendaEventRow
      key={row.occurrence.key}
      occurrence={row.occurrence}
      timing={row.timing}
      past={row.occurrence.end <= nowMs}
      live={row.occurrence.start <= nowMs && nowMs < row.occurrence.end}
      conflict={conflicts.has(row)}
      onPress={() => onPressOccurrence(row.occurrence)}
    />
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderTopWidth: theme.borderWidth.hairline,
        borderTopColor: theme.colors.borderSubtle,
      }}
    >
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={isToday ? `Today, ${formatDayLong(dateKey)}` : formatDayLong(dateKey)}
        style={{ width: AGENDA_RAIL_WIDTH, alignItems: 'center', gap: theme.spacing.xxs }}
      >
        <Text variant="caption" color={isToday ? 'accent' : 'tertiary'}>
          {formatWeekdayShort(dateKey)}
        </Text>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isToday ? theme.colors.accent : 'transparent',
          }}
        >
          <Text variant="headline" color={isToday ? 'onAccent' : 'primary'}>
            {Number(dateKey.slice(8))}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        {allDay.map(renderRow)}

        {timed.map((row, index) => (
          <Fragment key={row.occurrence.key}>
            {index === nowIndex ? (
              <NowLine label={formatTimeOfDay(now, timeZone, hourCycle)} />
            ) : null}
            {renderRow(row)}
          </Fragment>
        ))}
        {timed.length > 0 && nowIndex === timed.length ? (
          <NowLine label={formatTimeOfDay(now, timeZone, hourCycle)} />
        ) : null}

        {rows.length === 0 ? (
          <Text variant="footnote" color="tertiary" style={{ paddingTop: theme.spacing.xs }}>
            Nothing scheduled
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The current-time marker between today's events, led by a dot. */
function NowLine({ label }: { label: string }) {
  const theme = useTheme();
  const color = theme.colors.nowIndicator;

  return (
    <View
      accessibilityLabel={`Now, ${label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <View style={{ flex: 1, height: 1, backgroundColor: color }} />
      <Text variant="caption" style={{ color }}>
        {label}
      </Text>
    </View>
  );
}
