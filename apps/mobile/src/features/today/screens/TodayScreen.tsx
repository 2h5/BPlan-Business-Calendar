import { formatDuration, formatTimeOfDay, getZonedParts, resolveEventColor } from '@cal/domain';
import { ErrorState, LoadingState, useTheme } from '@cal/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { FAB_SIZE } from '../../../components/app-shell/floating-layout';
import { useEventEditorStore } from '../../../store/event-editor.store';
import { useQuickAddStore } from '../../../store/quick-add.store';
import { useTaskEditorStore } from '../../../store/task-editor.store';
import { FindTimeBar } from '../../scheduling';
import { useTaskActions } from '../../tasks/hooks/useTaskActions';
import { TodayHeader } from '../components/TodayHeader';
import { TodaySchedule } from '../components/TodaySchedule';
import { TodayTasksPanel } from '../components/TodayTasksPanel';
import { UpNextCard } from '../components/UpNextCard';
import { useTodaySummary, type TodaySummary } from '../hooks/useTodaySummary';
import { buildDayBar } from '../utils/day-bar';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Free working time for the card's summary line. */
function describeCapacity(
  summary: TodaySummary,
  now: Date,
): { capacity: string; detail: string | null } {
  const { freeTime, workdayEndsAt, timeZone, hourCycle } = summary;
  if (workdayEndsAt === null) return { capacity: 'Day off', detail: 'no working hours set' };
  if (now.getTime() >= workdayEndsAt) {
    return {
      capacity: 'Workday done',
      detail: `ended ${formatTimeOfDay(new Date(workdayEndsAt), timeZone, hourCycle)}`,
    };
  }
  if (freeTime.freeMinutes > 0) {
    return {
      capacity: `${formatDuration(freeTime.freeMinutes)} free`,
      detail: plural(freeTime.intervals.length, 'open block'),
    };
  }
  return { capacity: 'Fully booked', detail: null };
}

/**
 * The home screen. Top to bottom: what is next and the shape of the day, a
 * way to find time, today's schedule, and today's tasks — so the day itself
 * is on the first screen rather than below a stack of summary cards.
 */
export function TodayScreen() {
  const theme = useTheme();
  const summary = useTodaySummary();
  const openQuickAdd = useQuickAddStore((state) => state.open);
  const openNewEventOnDay = useEventEditorStore((state) => state.openNewOnDay);
  const openEvent = useEventEditorStore((state) => state.openEvent);
  const openTask = useTaskEditorStore((state) => state.openTask);
  const actions = useTaskActions();

  const { now, timeZone, hourCycle, fullName } = summary;

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone,
      }).format(now),
    [now, timeZone],
  );

  const greeting = useMemo(() => {
    const { hour } = getZonedParts(now, timeZone);
    const timeOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = fullName?.trim().split(' ')[0];
    return firstName ? `${timeOfDay}, ${firstName}` : timeOfDay;
  }, [now, timeZone, fullName]);

  const timed = useMemo(
    () => summary.eventOccurrences.filter((item) => !item.event.allDay),
    [summary.eventOccurrences],
  );
  const allDay = useMemo(
    () => summary.eventOccurrences.filter((item) => item.event.allDay),
    [summary.eventOccurrences],
  );
  const scheduleItems = useMemo(
    () => summary.timeline.filter((item) => item.kind === 'task' || !item.occurrence.event.allDay),
    [summary.timeline],
  );

  const dayBar = useMemo(
    () =>
      buildDayBar({
        dayStart: summary.dayStart,
        dayEnd: summary.dayEnd,
        now,
        timeZone,
        workdayStartsAt: summary.workdayStartsAt,
        workdayEndsAt: summary.workdayEndsAt,
        busy: timed.map((item) => ({
          key: item.key,
          start: item.start,
          end: item.end,
          color: resolveEventColor(item.event.color, item.calendar?.color, theme.colors.accent),
        })),
        free: summary.freeTime.intervals,
      }),
    [
      now,
      summary.dayEnd,
      summary.dayStart,
      summary.freeTime.intervals,
      summary.workdayEndsAt,
      summary.workdayStartsAt,
      theme.colors.accent,
      timeZone,
      timed,
    ],
  );

  if (summary.isLoading) return <LoadingState fullScreen label="Getting your day ready" />;

  if (summary.isError) {
    return (
      <ErrorState
        title="We could not load your day"
        message="Check your connection and try again."
        onRetry={summary.refetch}
      />
    );
  }

  const relevantCount =
    summary.buckets.overdue.length + summary.buckets.dueToday.length + summary.unscheduled.length;
  const tasksTotal = relevantCount + summary.completedToday.length;

  const next = timed.find((item) => item.end > now.getTime()) ?? null;
  // With nothing timed left, today's all-day event is still the thing "on".
  const headline = next ?? allDay[0] ?? null;
  const live = next ? now.getTime() >= next.start : false;
  const minutesUntilNext = next ? Math.max(0, Math.round((next.start - now.getTime()) / 60000)) : 0;
  const time = (ms: number) => formatTimeOfDay(new Date(ms), timeZone, hourCycle);

  const eyebrow = next
    ? live
      ? `Now · ends ${time(next.end)}`
      : minutesUntilNext === 0
        ? 'Up next · starting now'
        : `Up next · in ${formatDuration(minutesUntilNext)}`
    : headline
      ? 'Today'
      : 'Up next';
  const meta = next
    ? [`${time(next.start)} – ${time(next.end)}`, next.event.location ?? next.calendar?.name]
        .filter(Boolean)
        .join(' · ')
    : headline
      ? ['All day', headline.event.location].filter(Boolean).join(' · ')
      : 'Your calendar is clear for the rest of today';
  const { capacity, detail } = describeCapacity(summary, now);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <TodayHeader
        dateLabel={dateLabel}
        greeting={greeting}
        onSearch={() => router.push('/search', { dangerouslySingular: true })}
      />

      <View style={{ gap: theme.spacing.md }}>
        <UpNextCard
          eyebrow={eyebrow}
          title={headline?.event.title ?? 'Nothing else scheduled'}
          meta={meta}
          metaDotColor={
            headline
              ? resolveEventColor(
                  headline.event.color,
                  headline.calendar?.color,
                  theme.colors.accent,
                )
              : undefined
          }
          live={live}
          onPress={headline ? () => openEvent(headline.event.id) : undefined}
          tasksDone={summary.completedToday.length}
          tasksTotal={tasksTotal}
          capacity={capacity}
          capacityDetail={detail}
          allDayCount={allDay.length}
          dayBar={dayBar}
          hourCycle={hourCycle}
        />

        <FindTimeBar timeZone={timeZone} />
      </View>

      <TodaySchedule
        allDay={allDay}
        items={scheduleItems}
        timeZone={timeZone}
        hourCycle={hourCycle}
        now={now}
        onOpenEvent={openEvent}
        onOpenTask={openTask}
        onOpenCalendar={() => router.push('/(tabs)/calendar')}
        onPlan={() => openNewEventOnDay(summary.todayKey)}
      />

      <TodayTasksPanel
        overdue={summary.buckets.overdue}
        dueToday={summary.buckets.dueToday}
        unscheduled={summary.unscheduled}
        completedToday={summary.completedToday}
        lists={summary.taskLists}
        timeZone={timeZone}
        hourCycle={hourCycle}
        now={now}
        onQuickAdd={() => openQuickAdd('task')}
        onOpenTask={(task) => openTask(task.id)}
        onToggleComplete={actions.onToggleComplete}
        onSnooze={actions.onSnooze}
        onDelete={actions.onDelete}
        onMoveToToday={actions.onMoveToToday}
      />

      {/* Keeps the last row scrollable clear of the floating add button. */}
      <View style={{ height: FAB_SIZE + theme.spacing.xxl }} />
    </View>
  );
}
