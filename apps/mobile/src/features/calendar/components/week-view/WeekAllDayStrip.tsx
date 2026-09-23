import type { HourCycle } from '@cal/schemas';
import { Text, useTheme } from '@cal/ui';
import { Pressable, View, type ViewStyle } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import type { EventOccurrence } from '../../hooks/useCalendarWindow';
import { EventChip } from '../EventChip';

/** One chip line: the narrow title's line height plus the chip's padding. */
const ROW_HEIGHT = 17;
const ROW_GAP = 2;
const MAX_ROWS = 2;

export interface WeekAllDayStripProps {
  pages: { slot: number; dateKeys: string[] }[];
  byDateKey: Map<string, EventOccurrence[]>;
  timeZone: string;
  hourCycle: HourCycle;
  gutterWidth: number;
  /** Page width from `usePageSwipe`; 0 until measured. */
  width: number;
  stripStyle: AnimatedStyle<ViewStyle>;
  onPressOccurrence: (occurrence: EventOccurrence) => void;
  /** Where "+N" leads: the day, which lists everything. */
  onSelectDate: (dateKey: string) => void;
}

/**
 * The week's all-day events, one cell per day column, sliding with the
 * columns. A cell shows at most two lines; past that the second line becomes
 * "+N", so a busy day never pushes the hour grid further down than a quiet one.
 * The band is sized for the fullest week on the strip, so it holds still
 * mid-swipe, and is absent when none of them has an all-day event.
 */
export function WeekAllDayStrip({
  pages,
  byDateKey,
  timeZone,
  hourCycle,
  gutterWidth,
  width,
  stripStyle,
  onPressOccurrence,
  onSelectDate,
}: WeekAllDayStripProps) {
  const theme = useTheme();

  const allDayOf = (dateKey: string) =>
    (byDateKey.get(dateKey) ?? []).filter((o) => o.event.allDay);
  const fullest = Math.max(
    0,
    ...pages.flatMap((page) => page.dateKeys.map((key) => allDayOf(key).length)),
  );
  if (fullest === 0) return null;

  const rows = Math.min(fullest, MAX_ROWS);
  const height = rows * ROW_HEIGHT + (rows - 1) * ROW_GAP;

  const renderCell = (dateKey: string) => {
    const occurrences = allDayOf(dateKey);
    const overflow = occurrences.length > MAX_ROWS;
    const shown = overflow ? occurrences.slice(0, MAX_ROWS - 1) : occurrences;

    return (
      <View key={dateKey} style={{ flex: 1, gap: ROW_GAP, paddingHorizontal: 1 }}>
        {shown.map((occurrence) => (
          <View key={occurrence.key} style={{ height: ROW_HEIGHT }}>
            <EventChip
              occurrence={occurrence}
              timeZone={timeZone}
              hourCycle={hourCycle}
              compact
              narrow
              onPress={() => onPressOccurrence(occurrence)}
            />
          </View>
        ))}
        {overflow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${occurrences.length - shown.length} more all-day events`}
            onPress={() => onSelectDate(dateKey)}
            style={{ height: ROW_HEIGHT, justifyContent: 'center', paddingLeft: 2 }}
          >
            <Text variant="caption" color="tertiary" style={{ fontSize: 11, lineHeight: 13 }}>
              +{occurrences.length - shown.length}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flexDirection: 'row', paddingBottom: theme.spacing.xs }}>
      <View style={{ width: gutterWidth }} />
      <View style={{ flex: 1, height, overflow: 'hidden' }}>
        <Animated.View style={[{ flex: 1 }, stripStyle]}>
          {pages.map((page) => (
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
              {page.dateKeys.map(renderCell)}
            </View>
          ))}
        </Animated.View>
      </View>
    </View>
  );
}
