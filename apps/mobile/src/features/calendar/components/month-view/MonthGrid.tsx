import { isOccurrenceMovableByDay, layoutMonthWeek, toZonedDateKey } from '@cal/domain';
import { Text, useTheme } from '@cal/ui';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { GestureType } from 'react-native-gesture-handler';

import { DraggableEventBar, type EventDayMove } from './DraggableEventBar';
import type { EventOccurrence } from '../../hooks/useCalendarWindow';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const COLUMNS = 7;
const WEEKS = 6;
/** Lanes assumed before the grid has been measured. */
const FALLBACK_LANES = 3;
const BAR_HEIGHT = 15;
const BAR_GAP = 2;
/** Height of the date-number block each week reserves above its bars. */
const NUMBER_BLOCK = 28;
const OVERFLOW_HEIGHT = 13;

export interface MonthGridProps {
  /** 42 date keys: six whole weeks. */
  dateKeys: readonly string[];
  byDateKey: Map<string, EventOccurrence[]>;
  /** Month currently being viewed, 1-12, used to dim adjacent-month days. */
  focusedMonth: number;
  timeZone: string;
  now: Date;
  selectedDateKey: string;
  weekStartsOn: number;
  onSelectDate: (dateKey: string) => void;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
  /** Re-date an event dragged to another cell. Resolves once it settles. */
  onMoveOccurrence: (move: EventDayMove) => Promise<void>;
  /** The month pager's gesture, so a drag is not also a page turn. */
  pagerGesture?: GestureType;
  /** Turns a day delta into the date label shown under a dragged bar. */
  formatDayTarget: (occurrence: EventOccurrence, dayDelta: number) => string;
}

/**
 * A six-week grid.
 *
 * Each day lists what is actually on it, and an event covering several days is
 * drawn as one continuous bar across them rather than as a mark repeated per
 * day — so a trip or a multi-day booking reads as a single thing. Lane packing
 * is `layoutMonthWeek`; this file only turns columns and lanes into pixels.
 */
export function MonthGrid({
  dateKeys,
  byDateKey,
  focusedMonth,
  timeZone,
  now,
  selectedDateKey,
  weekStartsOn,
  onSelectDate,
  onPressOccurrence,
  onMoveOccurrence,
  pagerGesture,
  formatDayTarget,
}: MonthGridProps) {
  const theme = useTheme();
  const todayKey = toZonedDateKey(now, timeZone);

  const weekdayHeaders = Array.from(
    { length: COLUMNS },
    (_, index) => WEEKDAY_LETTERS[(weekStartsOn + index) % COLUMNS],
  );

  // Height available to the six week rows, measured rather than assumed: the
  // grid fills whatever the screen leaves it, so a taller phone shows more
  // events per day instead of leaving a gap under the last week.
  const [body, setBody] = useState({ width: 0, height: 0 });
  const rowHeight = body.height > 0 ? body.height / WEEKS : 0;
  // A dragged bar steps between dates by whole cells, so it needs one cell's
  // width. Zero until the grid is measured, which pins the drag for that first
  // frame rather than letting it jump to an arbitrary date.
  const columnWidth = body.width > 0 ? body.width / COLUMNS : 0;
  // Week rows are siblings, so a bar dragged down the grid would otherwise pass
  // *under* the rows it crosses. Raising the row it came from carries it over.
  const [draggingWeek, setDraggingWeek] = useState<number | null>(null);

  /** Lanes that fit in a row, given how much of it the bars may use. */
  const lanesThatFit = (reservedForOverflow: number) =>
    Math.max(
      1,
      Math.floor(
        (rowHeight - NUMBER_BLOCK - BAR_GAP - reservedForOverflow) / (BAR_HEIGHT + BAR_GAP),
      ),
    );

  const buildWeeks = (maxLanes: number) =>
    Array.from({ length: WEEKS }, (_, week) => {
      const weekKeys = dateKeys.slice(week * COLUMNS, week * COLUMNS + COLUMNS);
      const firstKey = weekKeys[0] ?? '';
      const lastKey = weekKeys[weekKeys.length - 1] ?? '';

      // One entry per event, not per day it touches: the bar is drawn once
      // and stretched, so a repeated bucket entry would stack duplicates.
      const seen = new Set<string>();
      const weekOccurrences: EventOccurrence[] = [];
      for (const dateKey of weekKeys) {
        for (const occurrence of byDateKey.get(dateKey) ?? []) {
          if (seen.has(occurrence.key)) continue;
          seen.add(occurrence.key);
          weekOccurrences.push(occurrence);
        }
      }

      const layout = layoutMonthWeek(
        weekOccurrences,
        (occurrence) => {
          const startKey = toZonedDateKey(new Date(occurrence.start), timeZone);
          // `end` is exclusive, so an event finishing at midnight belongs to
          // the day it ran in rather than the one it grazes.
          const endKey = toZonedDateKey(
            new Date(Math.max(occurrence.start, occurrence.end - 1)),
            timeZone,
          );

          // Date keys sort lexicographically, so a key outside the week can
          // be resolved to "before" or "after" without any date arithmetic.
          return {
            startColumn: startKey < firstKey ? -1 : weekKeys.indexOf(startKey),
            endColumn: endKey > lastKey ? COLUMNS : weekKeys.indexOf(endKey),
          };
        },
        { columns: COLUMNS, maxLanes },
      );

      return { weekKeys, ...layout };
    });

  const { weeks, lanes, showOverflowRow } = useMemo(() => {
    if (rowHeight <= 0) {
      return { weeks: buildWeeks(FALLBACK_LANES), lanes: FALLBACK_LANES, showOverflowRow: false };
    }

    // Try the densest packing first. Only if something actually spills does the
    // row give up a lane's worth of height to the "+N" line.
    const generous = lanesThatFit(0);
    const packed = buildWeeks(generous);
    const spills = packed.some((week) => week.overflowByColumn.some((count) => count > 0));
    if (!spills) return { weeks: packed, lanes: generous, showOverflowRow: false };

    const reduced = lanesThatFit(OVERFLOW_HEIGHT);
    return { weeks: buildWeeks(reduced), lanes: reduced, showOverflowRow: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- builders read only the values listed
  }, [dateKeys, byDateKey, timeZone, rowHeight]);

  // Every week is drawn to the same height, so a busy week and a free week keep
  // the grid's rhythm instead of one becoming a sliver.
  const barsHeight = lanes * (BAR_HEIGHT + BAR_GAP) + (showOverflowRow ? OVERFLOW_HEIGHT : 0);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', paddingBottom: theme.spacing.xs }}>
        {weekdayHeaders.map((letter, index) => (
          <View key={`${letter}-${index}`} style={{ flex: 1, alignItems: 'center' }}>
            <Text variant="caption" color="tertiary">
              {letter}
            </Text>
          </View>
        ))}
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(event) =>
          setBody({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        {weeks.map(({ weekKeys, segments, overflowByColumn }, week) => {
          if (weekKeys.length === 0) return null;

          return (
            <View key={week} style={{ height: rowHeight, zIndex: draggingWeek === week ? 1 : 0 }}>
              <View style={{ flexDirection: 'row' }}>
                {weekKeys.map((dateKey) => {
                  const day = Number(dateKey.split('-')[2]);
                  const inFocusedMonth = Number(dateKey.split('-')[1]) === focusedMonth;
                  const isToday = dateKey === todayKey;
                  const isSelected = dateKey === selectedDateKey;
                  const dayEvents = byDateKey.get(dateKey) ?? [];

                  return (
                    <Pressable
                      key={dateKey}
                      accessibilityRole="button"
                      accessibilityLabel={`${dateKey}, ${dayEvents.length} events`}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => onSelectDate(dateKey)}
                      style={{
                        flex: 1,
                        height: rowHeight,
                        alignItems: 'center',
                        paddingTop: theme.spacing.xs,
                        borderRadius: theme.radius.sm,
                        backgroundColor: isSelected ? theme.colors.accentSubtle : 'transparent',
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isToday ? theme.colors.accent : 'transparent',
                        }}
                      >
                        <Text
                          variant="footnote"
                          style={{
                            color: isToday
                              ? theme.colors.onAccent
                              : inFocusedMonth
                                ? theme.colors.textPrimary
                                : theme.colors.textTertiary,
                          }}
                        >
                          {day}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Bars sit over the day cells so a tap on empty space still selects
                the day; only the bars themselves capture a press. */}
              <View
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: NUMBER_BLOCK,
                  height: barsHeight,
                }}
              >
                {segments.map(
                  ({ item, startColumn, endColumn, lane, continuesBefore, continuesAfter }) => (
                    <DraggableEventBar
                      key={item.key}
                      occurrence={item}
                      continuesBefore={continuesBefore}
                      continuesAfter={continuesAfter}
                      weekIndex={week}
                      weekCount={WEEKS}
                      startColumn={startColumn}
                      columnCount={COLUMNS}
                      columnWidth={columnWidth}
                      rowHeight={rowHeight}
                      // A bar carried over from an earlier week is a clipped
                      // tail, not the event: drag it from the week it starts in.
                      movable={isOccurrenceMovableByDay(item) && !continuesBefore}
                      blocking={pagerGesture ? [pagerGesture] : undefined}
                      formatTarget={(dayDelta) => formatDayTarget(item, dayDelta)}
                      onPress={() => onPressOccurrence(item)}
                      onMove={onMoveOccurrence}
                      onDragChange={(dragging) => setDraggingWeek(dragging ? week : null)}
                      layout={{
                        top: lane * (BAR_HEIGHT + BAR_GAP),
                        height: BAR_HEIGHT,
                        left: `${(startColumn / COLUMNS) * 100}%`,
                        width: `${((endColumn - startColumn + 1) / COLUMNS) * 100}%`,
                      }}
                    />
                  ),
                )}

                {overflowByColumn.map((count, column) =>
                  count > 0 ? (
                    <View
                      key={`overflow-${column}`}
                      style={{
                        position: 'absolute',
                        top: lanes * (BAR_HEIGHT + BAR_GAP),
                        left: `${(column / COLUMNS) * 100}%`,
                        width: `${(1 / COLUMNS) * 100}%`,
                        alignItems: 'center',
                      }}
                    >
                      <Text variant="caption" color="tertiary">
                        {`+${count}`}
                      </Text>
                    </View>
                  ) : null,
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
