import {
  isOccurrenceMovable,
  layoutOverlappingEvents,
  MIN_VISUAL_MINUTES,
  toZonedDateKey,
} from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { useMemo, useRef, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import { GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { usePageSwipe } from '../../hooks/usePageSwipe';
import { dateKeyToInstant, weekDateKeys, weekdayOf, weekIndexOf } from '../../utils/window';
import { DraggableEventChip, type EventMove } from '../DraggableEventChip';

const HOUR_HEIGHT = 44;
const GUTTER_WIDTH = 44;

export interface WeekGridProps {
  byDateKey: Map<string, EventOccurrence[]>;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  selectedDateKey: string;
  weekStartsOn: number;
  onSelectDate: (dateKey: string) => void;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
  /** Called once a swipe has finished, with how many weeks it moved. */
  onChangeWeek: (delta: number) => void;
  /** Re-time an event dragged to another hour or day. Resolves once it settles. */
  onMoveOccurrence: (move: EventMove) => Promise<void>;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Seven day columns sharing one hour gutter, swipeable week to week.
 *
 * Only the day columns and their date headers slide; the hour gutter and the
 * vertical scroll stay put and are shared by every week, so mid-swipe the
 * incoming week's hours line up with the outgoing week's instead of each
 * page sitting at its own scroll position. Paging is `usePageSwipe`.
 *
 * Each column runs its own overlap layout: events only compete for width with
 * others on the same day, which is what keeps a busy Tuesday from squeezing a
 * quiet Wednesday.
 */
export function WeekGrid({
  byDateKey,
  timeZone,
  hourCycle,
  now,
  selectedDateKey,
  weekStartsOn,
  onSelectDate,
  onPressOccurrence,
  onChangeWeek,
  onMoveOccurrence,
}: WeekGridProps) {
  const theme = useTheme();
  const todayKey = toZonedDateKey(now, timeZone);
  const scrollRef = useRef<ScrollView>(null);

  const weekIndex = weekIndexOf(selectedDateKey, timeZone, weekStartsOn);
  const { pan, stripStyle, width, slot, onLayout } = usePageSwipe(weekIndex, onChangeWeek);
  // A dragged event steps between days by whole columns, so it needs the width
  // of one. Zero until the strip has been measured, which pins the drag
  // vertical for that first frame rather than letting it jump a random day.
  const columnWidth = width > 0 ? width / 7 : 0;
  // Columns are siblings, so a chip dragged towards Friday would otherwise pass
  // *under* the grid lines of every column it crosses. Raising the column it
  // came from carries the chip over them.
  const [draggingColumn, setDraggingColumn] = useState<number | null>(null);

  const pages = useMemo(
    () =>
      [-1, 0, 1].map((offset) => ({
        offset,
        slot: slot + offset,
        dateKeys: weekDateKeys(selectedDateKey, offset, timeZone, weekStartsOn),
      })),
    [slot, selectedDateKey, timeZone, weekStartsOn],
  );
  // Until the page width is known only the current week can be placed.
  const visiblePages = width > 0 ? pages : pages.filter((page) => page.offset === 0);

  /**
   * Where a page sits on the strip. The current header page stays in normal
   * flow — merely shifted by `left` — so it gives the header its height; the
   * others overlay it. Swapping which page is "current" moves nothing visually.
   */
  const headerPageStyle = (offset: number, pageSlot: number): ViewStyle =>
    width === 0
      ? { flexDirection: 'row' }
      : {
          flexDirection: 'row',
          position: offset === 0 ? 'relative' : 'absolute',
          top: 0,
          left: pageSlot * width,
          width,
        };

  const formatHour = (hour: number) =>
    hourCycle === 'h23'
      ? `${String(hour).padStart(2, '0')}`
      : hour === 0
        ? '12a'
        : hour === 12
          ? '12p'
          : hour < 12
            ? `${hour}a`
            : `${hour - 12}p`;

  const renderDayHeader = (dateKey: string) => {
    const day = Number(dateKey.split('-')[2]);
    const weekdayIndex = weekdayOf(dateKey);
    const isToday = dateKey === todayKey;
    const isSelected = dateKey === selectedDateKey;

    return (
      <View
        key={dateKey}
        style={{ flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm }}
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => onSelectDate(dateKey)}
      >
        <Text variant="caption" color="tertiary">
          {WEEKDAY_LETTERS[weekdayIndex]}
        </Text>
        <View
          style={{
            marginTop: 2,
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isToday
              ? theme.colors.accent
              : isSelected
                ? theme.colors.accentSubtle
                : 'transparent',
          }}
        >
          <Text
            variant="footnote"
            style={{
              color: isToday
                ? theme.colors.onAccent
                : isSelected
                  ? theme.colors.accent
                  : theme.colors.textPrimary,
            }}
          >
            {day}
          </Text>
        </View>
      </View>
    );
  };

  const renderDayColumn = (dateKey: string, columnIndex: number) => {
    const dayStartMs = dateKeyToInstant(dateKey, timeZone).getTime();
    const timed = (byDateKey.get(dateKey) ?? []).filter((o) => !o.event.allDay);

    const laidOut = layoutOverlappingEvents(timed, (occurrence) => ({
      // Clamp to this day so a multi-day event lays out per column.
      start: Math.max(occurrence.start, dayStartMs),
      end: Math.max(
        Math.min(occurrence.end, dayStartMs + 86_400_000),
        Math.max(occurrence.start, dayStartMs) + MIN_VISUAL_MINUTES * 60_000,
      ),
    }));

    return (
      <View
        key={dateKey}
        style={{
          flex: 1,
          borderLeftWidth: 1,
          borderLeftColor: theme.colors.gridLine,
          zIndex: draggingColumn === columnIndex ? 1 : 0,
        }}
      >
        {Array.from({ length: 24 }, (_, hour) => (
          <View
            key={hour}
            style={{
              height: HOUR_HEIGHT,
              borderTopWidth: 1,
              borderTopColor: theme.colors.gridLine,
            }}
          />
        ))}

        <View style={{ position: 'absolute', top: 0, left: 1, right: 1, bottom: 0 }}>
          {laidOut.map((placed) => {
            const top = ((placed.interval.start - dayStartMs) / 3_600_000) * HOUR_HEIGHT;
            const height =
              ((placed.interval.end - placed.interval.start) / 3_600_000) * HOUR_HEIGHT;

            return (
              <DraggableEventChip
                key={placed.item.key}
                occurrence={placed.item}
                dateKey={dateKey}
                timeZone={timeZone}
                hourCycle={hourCycle}
                compact
                hourHeight={HOUR_HEIGHT}
                columnWidth={columnWidth}
                columnIndex={columnIndex}
                columnCount={7}
                movable={isOccurrenceMovable(placed.item, dateKey, timeZone)}
                blocking={[scrollRef, pan]}
                onPress={() => onPressOccurrence(placed.item)}
                onMove={onMoveOccurrence}
                onDragChange={(dragging) => setDraggingColumn(dragging ? columnIndex : null)}
                layout={{
                  top,
                  height: Math.max(height - 1, 14),
                  left: `${placed.left * 100}%`,
                  width: `${placed.width * 100}%`,
                }}
              />
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: GUTTER_WIDTH }} />
          <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onLayout}>
            <Animated.View style={stripStyle}>
              {visiblePages.map((page) => (
                <View key={page.slot} style={headerPageStyle(page.offset, page.slot)}>
                  {page.dateKeys.map(renderDayHeader)}
                </View>
              ))}
            </Animated.View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentOffset={{ x: 0, y: HOUR_HEIGHT * 7 }}
        >
          <View style={{ height: 24 * HOUR_HEIGHT, flexDirection: 'row' }}>
            <View style={{ width: GUTTER_WIDTH }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <View
                  key={hour}
                  style={{
                    height: HOUR_HEIGHT,
                    alignItems: 'flex-end',
                    paddingRight: theme.spacing.xs,
                  }}
                >
                  <Text variant="caption" color="tertiary" style={{ marginTop: -6 }}>
                    {formatHour(hour)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ flex: 1, overflow: 'hidden' }}>
              <Animated.View style={[{ flex: 1 }, stripStyle]}>
                {visiblePages.map((page) => (
                  <View
                    key={page.slot}
                    style={
                      width === 0
                        ? { flex: 1, flexDirection: 'row' }
                        : {
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: page.slot * width,
                            width,
                            flexDirection: 'row',
                          }
                    }
                  >
                    {page.dateKeys.map(renderDayColumn)}
                  </View>
                ))}
              </Animated.View>
            </View>
          </View>
        </ScrollView>
      </View>
    </GestureDetector>
  );
}
