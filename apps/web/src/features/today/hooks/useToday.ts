import { calculateFreeTime, deviceTimeZone, toZonedDateKey } from '@cal/domain';
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
  const allDay = calendar.occurrences.filter((item) => item.event.allDay);
  const timed = calendar.occurrences
    .filter((item) => !item.event.allDay)
    .sort((a, b) => a.start - b.start);
  const next = timed.find((item) => item.end > now.getTime()) ?? null;
  const freeTime = calculateFreeTime({
    dayStart: calendar.window.start,
    dayEnd: calendar.window.end,
    now,
    timeZone,
    workingHours: profileQuery.data?.workingHours ?? [],
    busy: calendar.occurrences.map((item) => ({ start: item.start, end: item.end })),
  });

  return {
    now,
    todayKey,
    timeZone,
    profile: profileQuery.data,
    hourCycle: calendar.hourCycle,
    lists: listsQuery.data ?? [],
    allDay,
    timed,
    next,
    freeTime,
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
