import {
  layoutOverlappingEvents,
  MIN_VISUAL_MINUTES,
  minuteOfDay,
  toZonedDateKey,
} from '@cal/domain';
import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { usePageSwipe } from '../../hooks/usePageSwipe';
import { dateKeyToInstant, dayIndexOf, shiftDateKey, weekdayOf } from '../../utils/window';
import { EventChip } from '../EventChip';

export const HOUR_HEIGHT = 56;
const GUTTER_WIDTH = 52;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface DayTimelineProps {
  dateKey: string;
  byDateKey: Map<string, EventOccurrence[]>;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
  /** Tapping empty space creates an event at that time. */
  onPressSlot?: (start: Date) => void;
  /** Called once a swipe has finished, with how many days it moved. */
  onChangeDay: (delta: number) => void;
}

interface DayPage {
  offset: number;
  slot: number;
  dateKey: string;
  dayStartMs: number;
  occurrences: EventOccurrence[];
}

/**
 * A scrollable 24-hour column, swipeable day to day.
 *
 * Only the day itself slides; the hour gutter and the vertical scroll stay put
 * and are shared by every day, so mid-swipe the incoming day's hours line up
 * with the outgoing one's. Paging is `usePageSwipe`, as in the week and month
 * views.
 *
 * Timed events are absolutely positioned against the hour grid; all-day events
 * sit in a fixed band above it, because giving them a slot on the timeline
 * would either misrepresent their length or swallow the whole column.
 */
export function DayTimeline({
  dateKey,
  byDateKey,
  timeZone,
  hourCycle,
  now,
  onPressOccurrence,
  onPressSlot,
  onChangeDay,
}: DayTimelineProps) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const todayKey = toZonedDateKey(now, timeZone);

  const { pan, stripStyle, width, slot, onLayout } = usePageSwipe(dayIndexOf(dateKey), onChangeDay);

  const pages = useMemo<DayPage[]>(
    () =>
      [-1, 0, 1].map((offset) => {
        const pageKey = shiftDateKey(dateKey, offset, timeZone);
        return {
          offset,
          slot: slot + offset,
          dateKey: pageKey,
          dayStartMs: dateKeyToInstant(pageKey, timeZone).getTime(),
          occurrences: byDateKey.get(pageKey) ?? [],
        };
      }),
    [dateKey, slot, timeZone, byDateKey],
  );
  // Until the page width is known only the current day can be placed.
  const visiblePages = width > 0 ? pages : pages.filter((page) => page.offset === 0);

  // The all-day band shows if any of the three days needs it, so it never
  // appears or vanishes — shoving the timeline — at the moment a swipe lands.
  const allDaySample = pages.flatMap((page) => page.occurrences).find((o) => o.event.allDay);

  // Position once, on open: at the current time today, else the working day.
  // Deliberately not on every day change — swiping between days keeps
  // whatever hour the user has scrolled to, like the week view.
  useEffect(() => {
    const target =
      dateKey === todayKey
        ? (minuteOfDay(now, timeZone) / 60) * HOUR_HEIGHT - HOUR_HEIGHT * 2
        : HOUR_HEIGHT * 7;
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only, see above
  }, []);

  const pageStyle = (pageSlot: number): ViewStyle =>
    width === 0
      ? { flex: 1 }
      : { position: 'absolute', top: 0, bottom: 0, left: pageSlot * width, width };

  const formatHour = (hour: number) => {
    if (hourCycle === 'h23') return `${String(hour).padStart(2, '0')}:00`;
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
  };

  /**
   * Where a header page sits. The current one stays in normal flow — merely
   * shifted by `left` — so it gives the header its height; the others overlay
   * it, and swapping which page is current moves nothing visually.
   */
  const headerPageStyle = (offset: number, pageSlot: number): ViewStyle =>
    width === 0
      ? {}
      : { position: offset === 0 ? 'relative' : 'absolute', top: 0, left: pageSlot * width, width };

  // The date rides on the page, so a swipe visibly carries one day off and the
  // next one on — without it an empty day is identical grid lines sliding over
  // identical grid lines, and the swipe looks like an instant switch.
  const renderDayHeader = (page: DayPage) => (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
      {/* The name alone: the date is already in the screen title. */}
      <Text
        variant="footnote"
        // Same colour as the hour labels beside it; today keeps its accent.
        color={page.dateKey === todayKey ? 'accent' : 'tertiary'}
      >
        {WEEKDAY_NAMES[weekdayOf(page.dateKey)]}
      </Text>
    </View>
  );

  const renderAllDay = (page: DayPage) => (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs, paddingRight: theme.spacing.lg }}>
      {page.occurrences
        .filter((o) => o.event.allDay)
        .map((occurrence) => (
          <View key={occurrence.key} style={{ flex: 1 }}>
            <EventChip
              occurrence={occurrence}
              timeZone={timeZone}
              hourCycle={hourCycle}
              compact
              onPress={() => onPressOccurrence(occurrence)}
            />
          </View>
        ))}
    </View>
  );

  const renderDay = (page: DayPage) => {
    const timed = page.occurrences.filter((o) => !o.event.allDay);
    const laidOut = layoutOverlappingEvents(timed, (occurrence) => ({
      start: occurrence.start,
      // Give very short events a floor so they stay readable and tappable.
      end: Math.max(occurrence.end, occurrence.start + MIN_VISUAL_MINUTES * 60_000),
    }));
    const nowOffset =
      page.dateKey === todayKey ? (minuteOfDay(now, timeZone) / 60) * HOUR_HEIGHT : null;

    return (
      <>
        {Array.from({ length: 24 }, (_, hour) => (
          <View
            key={hour}
            style={{
              height: HOUR_HEIGHT,
              borderTopWidth: 1,
              borderTopColor: theme.colors.gridLine,
            }}
            onStartShouldSetResponder={() => !!onPressSlot}
            onResponderRelease={() => onPressSlot?.(new Date(page.dayStartMs + hour * 3_600_000))}
          />
        ))}

        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          {laidOut.map((placed) => {
            const top = ((placed.interval.start - page.dayStartMs) / 3_600_000) * HOUR_HEIGHT;
            const height =
              ((placed.interval.end - placed.interval.start) / 3_600_000) * HOUR_HEIGHT;

            return (
              <EventChip
                key={placed.item.key}
                occurrence={placed.item}
                timeZone={timeZone}
                hourCycle={hourCycle}
                compact={height < 34}
                onPress={() => onPressOccurrence(placed.item)}
                layout={{
                  top,
                  height: Math.max(height - 2, 18),
                  left: `${placed.left * 100}%`,
                  width: `${placed.width * 100 - 1}%`,
                }}
              />
            );
          })}
        </View>

        {nowOffset !== null ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: nowOffset - 4,
              left: 0,
              right: 0,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.nowIndicator,
              }}
            />
            <View style={{ flex: 1, height: 1, backgroundColor: theme.colors.nowIndicator }} />
          </View>
        ) : null}
      </>
    );
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: GUTTER_WIDTH }} />
          <View style={{ flex: 1, overflow: 'hidden' }}>
            <Animated.View style={stripStyle}>
              {visiblePages.map((page) => (
                <View key={page.slot} style={headerPageStyle(page.offset, page.slot)}>
                  {renderDayHeader(page)}
                </View>
              ))}
            </Animated.View>
          </View>
        </View>

        {allDaySample ? (
          <View style={{ flexDirection: 'row', paddingBottom: theme.spacing.sm }}>
            <View style={{ width: GUTTER_WIDTH }} />
            <View style={{ flex: 1, overflow: 'hidden' }}>
              {/* An invisible chip gives the band its height, so the band is
                  exactly one chip tall without a hard-coded number. */}
              <View style={{ opacity: 0 }} pointerEvents="none">
                <EventChip
                  occurrence={allDaySample}
                  timeZone={timeZone}
                  hourCycle={hourCycle}
                  compact
                  onPress={() => undefined}
                />
              </View>
              <Animated.View style={[StyleSheet.absoluteFill, stripStyle]}>
                {visiblePages.map((page) => (
                  <View key={page.slot} style={pageStyle(page.slot)}>
                    {renderAllDay(page)}
                  </View>
                ))}
              </Animated.View>
            </View>
          </View>
        ) : null}

        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
          <View style={{ height: 24 * HOUR_HEIGHT, flexDirection: 'row' }}>
            <View style={{ width: GUTTER_WIDTH }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <View
                  key={hour}
                  style={{
                    height: HOUR_HEIGHT,
                    alignItems: 'flex-end',
                    paddingRight: theme.spacing.sm,
                  }}
                >
                  <Text variant="caption" color="tertiary" style={{ marginTop: -7 }}>
                    {formatHour(hour)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onLayout}>
              <Animated.View style={[{ flex: 1 }, stripStyle]}>
                {visiblePages.map((page) => (
                  <View
                    key={page.slot}
                    // Each day's leading edge is drawn, as the week's columns
                    // are, so the timeline itself is seen to move mid-swipe.
                    style={[
                      pageStyle(page.slot),
                      { borderLeftWidth: 1, borderLeftColor: theme.colors.gridLine },
                    ]}
                  >
                    {renderDay(page)}
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
