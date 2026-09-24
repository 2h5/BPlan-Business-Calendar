import { addZonedDays, toZonedDateKey } from '@cal/domain';
import { ErrorState, IconButton, LoadingState, SegmentedControl, useTheme } from '@cal/ui';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { type CalendarViewMode, useCalendarViewStore } from '../../../store/calendar-view.store';
import { useEventEditorStore } from '../../../store/event-editor.store';
import { AgendaList } from '../components/agenda-view/AgendaList';
import { CalendarHeading } from '../components/CalendarHeading';
import { DayTimeline } from '../components/day-view/DayTimeline';
import { MonthPager } from '../components/month-view/MonthPager';
import { WeekGrid } from '../components/week-view/WeekGrid';
import { useAgendaRefresh } from '../hooks/useAgendaRefresh';
import { useCalendarWindow } from '../hooks/useCalendarWindow';
import { useMoveOccurrence, useMoveOccurrenceByDays } from '../hooks/useMoveOccurrence';
import { formatDayShiftTarget } from '../utils/format';
import { dateKeyToInstant, monthIndexOf } from '../utils/window';

const MODES: { value: CalendarViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
];

/**
 * How wide a span each view covers. A switch rolls the title the way the view
 * opened out — widening rolls down, narrowing rolls up — which gives the change
 * the same vocabulary as stepping through time, where later rolls down.
 */
const MODE_RANK: Record<CalendarViewMode, number> = { day: 0, week: 1, month: 2, agenda: 3 };

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Composes the four calendar views over one shared data window.
 *
 * Per the repository's screen rule this file only reads store state, calls the
 * feature hook, and picks a view — the expansion, layout, and formatting all
 * live below it.
 */
export function CalendarScreen() {
  const theme = useTheme();
  const agendaRefresh = useAgendaRefresh();
  const mode = useCalendarViewStore((state) => state.mode);
  const setMode = useCalendarViewStore((state) => state.setMode);
  const selectedDateKey = useCalendarViewStore((state) => state.selectedDateKey);
  const setSelectedDateKey = useCalendarViewStore((state) => state.setSelectedDateKey);

  // Which way the title rolls on the next date change: +1 later, -1 earlier.
  // Set by each step before it changes the date — see CalendarHeading.
  const rollDirection = useSharedValue(1);

  const openEvent = useEventEditorStore((state) => state.openEvent);
  const openNewEvent = useEventEditorStore((state) => state.openNew);
  const openNewEventOnDay = useEventEditorStore((state) => state.openNewOnDay);

  const { window, byDateKey, timeZone, hourCycle, weekStartsOn, isLoading, isError, refetch } =
    useCalendarWindow();

  // Dragging an event re-times it in place; the editor is for everything else
  // about it. The hour grids move it to a time, the month grid to a date.
  const moveOccurrence = useMoveOccurrence(timeZone);
  const moveOccurrenceByDays = useMoveOccurrenceByDays(timeZone);

  const now = new Date();
  const anchor = dateKeyToInstant(selectedDateKey, timeZone);
  const [year, month] = selectedDateKey.split('-').map(Number);

  /** Step by one view's worth: a day, a week, or a month. */
  const shift = (direction: number) => {
    rollDirection.value = direction < 0 ? -1 : 1;
    const days = mode === 'day' ? 1 : mode === 'week' ? 7 : mode === 'agenda' ? 28 : 0;

    if (days > 0) {
      setSelectedDateKey(
        toZonedDateKey(addZonedDays(anchor, days * direction, timeZone), timeZone),
      );
      return;
    }

    // Month view steps whole months, clamped so 31 Jan → 28 Feb rather than March.
    const absolute = (year ?? 1970) * 12 + ((month ?? 1) - 1) + direction;
    const nextYear = Math.floor(absolute / 12);
    const nextMonth = (absolute % 12) + 1;
    const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
    const day = Math.min(Number(selectedDateKey.split('-')[2]), lastDay);

    setSelectedDateKey(
      `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    );
  };

  /** Select a date directly, rolling the title towards it. */
  const selectDate = (dateKey: string) => {
    rollDirection.value = dateKey < selectedDateKey ? -1 : 1;
    setSelectedDateKey(dateKey);
  };

  const goToToday = () => {
    const todayKey = toZonedDateKey(now, timeZone);
    // Date keys sort as dates, so this says whether today lies later or earlier.
    rollDirection.value = todayKey < selectedDateKey ? -1 : 1;
    setSelectedDateKey(todayKey);
  };

  /** Switch view, rolling the title the way the span changes. */
  const changeMode = (next: CalendarViewMode) => {
    rollDirection.value = MODE_RANK[next] < MODE_RANK[mode] ? -1 : 1;
    setMode(next);
  };

  // The title rolls piece by piece, so only what changed moves: stepping a day
  // rolls the number, and the month — or the year — turns over only when it
  // too changes. A week step inside one month leaves the title still.
  //
  // Switching view reads as the same motion for free: day shows the date where
  // every other view shows the year, so day to week rolls that one piece and
  // holds the month steady. Agenda carries the same two pieces as week and
  // month rather than one joined string, so moving between those three leaves
  // a title that has not changed alone instead of rolling it in place.
  const monthName = MONTHS[(month ?? 1) - 1] ?? '';
  const headingSegments =
    mode === 'day'
      ? [monthName, String(Number(selectedDateKey.split('-')[2]))]
      : [monthName, String(year)];

  return (
    <View style={{ flex: 1, gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          {/* Deliberately not keyed on `mode`: see CalendarHeading. */}
          <CalendarHeading segments={headingSegments} direction={rollDirection} />
        </View>

        <IconButton name="chevron-back" accessibilityLabel="Previous" onPress={() => shift(-1)} />
        <IconButton name="today-outline" accessibilityLabel="Go to today" onPress={goToToday} />
        <IconButton name="chevron-forward" accessibilityLabel="Next" onPress={() => shift(1)} />
        <IconButton
          name="add"
          tone="accent"
          filled
          accessibilityLabel="New event"
          onPress={() => openNewEventOnDay(selectedDateKey)}
        />
      </View>

      <SegmentedControl options={MODES} value={mode} onChange={changeMode} />

      {isLoading ? (
        <LoadingState label="Loading your calendar" />
      ) : isError ? (
        <ErrorState
          title="We could not load your calendar"
          message="Check your connection and try again."
          onRetry={refetch}
        />
      ) : mode === 'day' ? (
        <DayTimeline
          dateKey={selectedDateKey}
          byDateKey={byDateKey}
          onChangeDay={shift}
          timeZone={timeZone}
          hourCycle={hourCycle}
          now={now}
          onPressOccurrence={(occurrence) => openEvent(occurrence.event.id)}
          onPressSlot={(start) => openNewEvent(start)}
          onMoveOccurrence={moveOccurrence}
        />
      ) : mode === 'week' ? (
        <WeekGrid
          weekStartsOn={weekStartsOn}
          onChangeWeek={shift}
          byDateKey={byDateKey}
          timeZone={timeZone}
          hourCycle={hourCycle}
          now={now}
          selectedDateKey={selectedDateKey}
          onSelectDate={selectDate}
          onPressOccurrence={(occurrence) => openEvent(occurrence.event.id)}
          onPressSlot={(start) => openNewEvent(start)}
          onMoveOccurrence={moveOccurrence}
        />
      ) : mode === 'month' ? (
        // Swiping drags the neighbouring months into view; the grid sizes its
        // rows to the height left, so it fills the screen instead of scrolling.
        <MonthPager
          monthIndex={monthIndexOf(selectedDateKey)}
          onChangeMonth={shift}
          byDateKey={byDateKey}
          timeZone={timeZone}
          now={now}
          selectedDateKey={selectedDateKey}
          weekStartsOn={weekStartsOn}
          onSelectDate={(dateKey) => {
            setSelectedDateKey(dateKey);
            setMode('day');
          }}
          onPressOccurrence={(occurrence) => openEvent(occurrence.event.id)}
          onMoveOccurrence={moveOccurrenceByDays}
          formatDayTarget={(occurrence, dayDelta) =>
            formatDayShiftTarget(occurrence.start, dayDelta, timeZone)
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={agendaRefresh.refreshing}
              onRefresh={agendaRefresh.onRefresh}
              tintColor={theme.colors.textSecondary}
            />
          }
        >
          <AgendaList
            dateKeys={window.dateKeys}
            byDateKey={byDateKey}
            timeZone={timeZone}
            hourCycle={hourCycle}
            now={now}
            onPressOccurrence={(occurrence) => openEvent(occurrence.event.id)}
          />
        </ScrollView>
      )}
    </View>
  );
}
