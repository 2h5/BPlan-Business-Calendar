import { calculateFreeTime, deviceTimeZone, expandWorkingHours, toZonedDateKey } from '@cal/domain';
import { useEffect, useMemo, useState } from 'react';

import { useCalendarWindow } from '../../calendar/hooks/useCalendarWindow';
import { useProfile } from '../../settings/hooks/useSettings';
import { useTaskBuckets } from '../../tasks/hooks/useTaskBuckets';
import { useTaskLists } from '../../tasks/hooks/useTasks';
import { millisecondsUntilNextClockUpdate } from '../utils/today-clock';

function useLocalNow(timeZone: string): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setNow(new Date()),
      millisecondsUntilNextClockUpdate(now, timeZone),
    );
    return () => window.clearTimeout(timeout);
  }, [now, timeZone]);

  return now;
}

export function useToday() {
  const profileQuery = useProfile();
  const timeZone = profileQuery.data?.timezone ?? deviceTimeZone();
  const now = useLocalNow(timeZone);
  const todayKey = toZonedDateKey(now, timeZone);
  const calendar = useCalendarWindow('day', todayKey);
  const tasks = useTaskBuckets({ listId: null, filter: 'inbox', timeZone });
  const listsQuery = useTaskLists();

  const unscheduled = useMemo(
    () =>
      tasks.buckets.unscheduled.filter(
        (task) => task.status === 'open' && task.isFlexible && task.estimatedMinutes !== null,
      ),
    [tasks.buckets.unscheduled],
  );
  const completedToday = useMemo(
    () =>
      tasks.buckets.allCompleted.filter(
        (task) =>
          task.completedAt && toZonedDateKey(new Date(task.completedAt), timeZone) === todayKey,
      ),
    [tasks.buckets.allCompleted, timeZone, todayKey],
  );
  const allDay = useMemo(
    () => calendar.occurrences.filter((item) => item.event.allDay),
    [calendar.occurrences],
  );
  const timed = useMemo(
    () =>
      calendar.occurrences.filter((item) => !item.event.allDay).sort((a, b) => a.start - b.start),
    [calendar.occurrences],
  );
  const next = timed.find((item) => item.end > now.getTime()) ?? null;
  const workingHours = profileQuery.data?.workingHours;
  const { start: dayStart, end: dayEnd } = calendar.window;
  // All-day events do not block working time, matching mobile and how Google
  // and Outlook mark them "free" — a conference banner is not a booked day.
  const freeTime = useMemo(
    () =>
      calculateFreeTime({
        dayStart,
        dayEnd,
        now,
        timeZone,
        workingHours: workingHours ?? [],
        busy: timed.map((item) => ({ start: item.start, end: item.end })),
      }),
    [dayEnd, dayStart, now, timeZone, timed, workingHours],
  );
  const { workdayStartsAt, workdayEndsAt } = useMemo(() => {
    const windows = expandWorkingHours(
      { start: dayStart.getTime(), end: dayEnd.getTime() },
      workingHours ?? [],
      timeZone,
    );
    return {
      workdayStartsAt: windows.length > 0 ? Math.min(...windows.map((w) => w.start)) : null,
      workdayEndsAt: windows.length > 0 ? Math.max(...windows.map((w) => w.end)) : null,
    };
  }, [dayEnd, dayStart, timeZone, workingHours]);

  return {
    now,
    todayKey,
    dayStart,
    dayEnd,
    timeZone,
    profile: profileQuery.data,
    hourCycle: calendar.hourCycle,
    lists: listsQuery.data ?? [],
    allDay,
    timed,
    next,
    freeTime,
    workdayStartsAt,
    workdayEndsAt,
    overdue: tasks.buckets.overdue,
    dueToday: tasks.buckets.dueToday,
    unscheduled,
    completedToday,
    isLoading:
      profileQuery.isLoading || calendar.isLoading || tasks.isLoading || listsQuery.isLoading,
    isError: profileQuery.isError || calendar.isError || tasks.isError || listsQuery.isError,
    refetch: () => {
      void profileQuery.refetch();
      calendar.refetch();
      tasks.refetch();
      void listsQuery.refetch();
    },
  };
}
