import { formatDuration, formatTimeOfDay, getZonedParts } from '@cal/domain';
import { ErrorState, LoadingState, useTheme } from '@cal/ui';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useEventEditorStore } from '../../../store/event-editor.store';
import { useQuickAddStore } from '../../../store/quick-add.store';
import { useTaskEditorStore } from '../../../store/task-editor.store';
import { FindTimeBox } from '../../scheduling';
import { useTaskActions } from '../../tasks/hooks/useTaskActions';
import { BentoCard, type BentoPillTone } from '../components/BentoCard';
import { TodayHero } from '../components/TodayHero';
import { TodayPanel } from '../components/TodayPanel';
import { TodayTasksPanel } from '../components/TodayTasksPanel';
import { TodayTimeline } from '../components/TodayTimeline';
import { useTodaySummary } from '../hooks/useTodaySummary';

/** A standard workday, used to express remaining free time as a percentage. */
const WORKDAY_MINUTES = 480;

/**
 * The morning check-in surface, laid out to match the web client's Today page:
 * a command hero, the Find Time box, three metric tiles, then the schedule and
 * task panels — which the web sits side by side and a phone has to stack.
 */
export function TodayScreen() {
  const theme = useTheme();
  const summary = useTodaySummary();
  const openQuickAdd = useQuickAddStore((state) => state.open);
  const openNewEvent = useEventEditorStore((state) => state.openNew);
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
        year: 'numeric',
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

  const timed = summary.eventOccurrences.filter((item) => !item.event.allDay);
  const allDay = summary.eventOccurrences.filter((item) => item.event.allDay);

  const relevantCount =
    summary.buckets.overdue.length + summary.buckets.dueToday.length + summary.unscheduled.length;
  const totalTasks = relevantCount + summary.completedToday.length;
  const completionPercent =
    totalTasks > 0 ? Math.round((summary.completedToday.length / totalTasks) * 100) : 100;
  const capacityPercent = Math.min(
    100,
    Math.round((summary.freeTime.freeMinutes / WORKDAY_MINUTES) * 100),
  );

  const next = timed.find((item) => item.end > now.getTime()) ?? null;
  const nextIsActive = next ? now.getTime() >= next.start && now.getTime() < next.end : false;
  const minutesUntilNext = next ? Math.max(0, Math.round((next.start - now.getTime()) / 60000)) : 0;

  const upNextPill: { label: string; tone: BentoPillTone } | undefined = !next
    ? undefined
    : nextIsActive
      ? { label: 'Happening Now', tone: 'active' }
      : minutesUntilNext <= 60
        ? { label: `In ${minutesUntilNext}m`, tone: 'soon' }
        : undefined;

  const taskPill: { label: string; tone: BentoPillTone } | undefined =
    summary.buckets.overdue.length > 0
      ? { label: `${summary.buckets.overdue.length} Overdue`, tone: 'overdue' }
      : totalTasks > 0 && summary.completedToday.length === totalTasks
        ? { label: 'All Caught Up', tone: 'done' }
        : undefined;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <TodayHero
        dateLabel={dateLabel}
        clockLabel={formatTimeOfDay(now, timeZone, hourCycle)}
        timeZone={timeZone}
        greeting={greeting}
        subtitle={
          timed.length > 0 || relevantCount > 0
            ? `You have ${timed.length} event${timed.length === 1 ? '' : 's'} and ${relevantCount} active task${relevantCount === 1 ? '' : 's'} today.`
            : 'Your schedule is clear and you have no pending tasks for today.'
        }
        onNewTask={() => openQuickAdd('task')}
        onNewEvent={() => openNewEvent(summary.dayStart)}
        onSearch={() => router.push('/(tabs)/search')}
      />

      <FindTimeBox timeZone={timeZone} />

      <View style={{ gap: theme.spacing.md }}>
        <BentoCard
          eyebrow="Up Next"
          pill={upNextPill}
          icon="time-outline"
          iconTone="accent"
          highlighted={nextIsActive}
          value={next?.event.title ?? 'No upcoming events'}
          meta={
            next
              ? `${formatTimeOfDay(new Date(next.start), timeZone, hourCycle)} – ${formatTimeOfDay(
                  new Date(next.end),
                  timeZone,
                  hourCycle,
                )}${next.event.location ? ` · ${next.event.location}` : ''}`
              : 'Schedule is open for deep work'
          }
          metaDotColor={next ? (next.calendar?.color ?? theme.colors.accent) : undefined}
          onPress={next ? () => openEvent(next.event.id) : undefined}
        />

        <BentoCard
          eyebrow="Focus Capacity"
          icon="disc-outline"
          iconTone="focus"
          value={
            summary.freeTime.freeMinutes > 0
              ? `${formatDuration(summary.freeTime.freeMinutes)} free`
              : 'Fully booked'
          }
          meta={
            summary.freeTime.intervals.length > 0
              ? `${summary.freeTime.intervals.length} open block${
                  summary.freeTime.intervals.length === 1 ? '' : 's'
                } inside working hours`
              : 'No remaining open windows today'
          }
          progress={{ percent: capacityPercent, label: `${capacityPercent}% open`, tone: 'focus' }}
        />

        <BentoCard
          eyebrow="Task Pulse"
          pill={taskPill}
          icon="checkmark-circle-outline"
          iconTone="success"
          value={
            totalTasks > 0 ? `${summary.completedToday.length} of ${totalTasks} done` : 'No tasks'
          }
          meta={
            summary.buckets.dueToday.length > 0
              ? `${summary.buckets.dueToday.length} due today`
              : summary.buckets.overdue.length > 0
                ? `${summary.buckets.overdue.length} needing attention`
                : totalTasks > 0
                  ? 'All daily commitments completed!'
                  : 'Clear task queue'
          }
          progress={{
            percent: completionPercent,
            label: `${completionPercent}%`,
            tone: 'success',
          }}
        />
      </View>

      <TodayPanel
        title="Schedule"
        count={allDay.length + timed.length}
        actionLabel="Full calendar →"
        onAction={() => router.push('/(tabs)/calendar')}
      >
        <TodayTimeline
          items={timed}
          allDay={allDay}
          timeZone={timeZone}
          hourCycle={hourCycle}
          now={now}
          onOpenEvent={openEvent}
          onAddEvent={() => openNewEvent(summary.dayStart)}
        />
      </TodayPanel>

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
      />
    </View>
  );
}
