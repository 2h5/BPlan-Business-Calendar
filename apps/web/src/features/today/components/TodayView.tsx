import {
  addZonedDays,
  describeTaskDue,
  formatDuration,
  formatTimeOfDay,
  getZonedParts,
  isNotablePriority,
  PRIORITY_LABELS,
  zonedWallClockToUtc,
} from '@cal/domain';
import type { TaskList, TaskPriority } from '@cal/schemas';
import React, { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './TodayView.module.css';
import { Select } from '../../../components/forms/Select';
import type { TaskWithTags } from '../../tasks/api/tasks.api';
import {
  useCreateTask,
  useDeleteTask,
  useSnoozeTask,
  useToggleTaskComplete,
} from '../../tasks/hooks/useTasks';
import { useToday } from '../hooks/useToday';

export function TodayView() {
  const today = useToday();
  const navigate = useNavigate();
  const toggle = useToggleTaskComplete();
  const snooze = useSnoozeTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isQuickAddFullyOpen, setIsQuickAddFullyOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickListId, setQuickListId] = useState<string>('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('normal');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

  const listOptions = useMemo(
    () => [
      { value: '', label: 'Inbox' },
      ...today.lists.map((l) => ({ value: l.id, label: l.name })),
    ],
    [today.lists],
  );

  const priorityOptions = useMemo(
    () => [
      { value: 'normal', label: 'Normal Priority' },
      { value: 'high', label: 'High Priority' },
      { value: 'urgent', label: 'Urgent' },
      { value: 'low', label: 'Low Priority' },
    ],
    [],
  );

  const scheduleHeadingId = useId();
  const tasksHeadingId = useId();

  const relevantCount = today.overdue.length + today.dueToday.length + today.unscheduled.length;
  const totalTasks = relevantCount + today.completedToday.length;
  const completionPercentage =
    totalTasks > 0 ? Math.round((today.completedToday.length / totalTasks) * 100) : 100;

  const localParts = useMemo(
    () => getZonedParts(today.now, today.timeZone),
    [today.now, today.timeZone],
  );

  const greeting = useMemo(() => {
    const hour = localParts.hour;
    const timeOfDay = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = today.profile?.fullName?.trim().split(' ')[0];
    return firstName ? `${timeOfDay}, ${firstName}` : timeOfDay;
  }, [localParts.hour, today.profile?.fullName]);

  const fullDateString = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: today.timeZone,
    }).format(today.now);
  }, [today.now, today.timeZone]);

  const liveTimeString = useMemo(() => {
    return formatTimeOfDay(today.now, today.timeZone, today.hourCycle);
  }, [today.now, today.timeZone, today.hourCycle]);

  // Check if the "next" event is currently active or upcoming
  const nextStatus = useMemo(() => {
    if (!today.next) return null;
    const nowMs = today.now.getTime();
    const isActive = nowMs >= today.next.start && nowMs < today.next.end;
    const diffMinutes = Math.max(0, Math.round((today.next.start - nowMs) / 60000));
    return {
      isActive,
      diffMinutes,
    };
  }, [today.next, today.now]);

  const handleOpenQuickAdd = () => {
    setIsQuickAddOpen(true);
    setIsQuickAddFullyOpen(false);
    requestAnimationFrame(() => {
      quickInputRef.current?.focus({ preventScroll: true });
    });
  };

  const handleCancelQuickAdd = () => {
    setIsQuickAddFullyOpen(false);
    setIsQuickAddOpen(false);
    setQuickTitle('');
  };

  const handleSubmitQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed || isSubmittingTask) return;

    try {
      setIsSubmittingTask(true);
      // Default to due today at 18:00 local time without exact hour enforced
      const parts = getZonedParts(today.now, today.timeZone);
      const todayDueAt = zonedWallClockToUtc(
        {
          year: parts.year,
          month: parts.month,
          day: parts.day,
          hour: 18,
          minute: 0,
        },
        today.timeZone,
      );

      await createTask.mutateAsync({
        title: trimmed,
        listId: quickListId || null,
        priority: quickPriority,
        dueAt: todayDueAt.toISOString(),
        hasDueTime: false,
        isFlexible: true,
        tagIds: [],
      });

      setQuickTitle('');
      setQuickListId('');
      setQuickPriority('normal');
      setIsQuickAddFullyOpen(false);
      setIsQuickAddOpen(false);
    } catch {
      // Error handled by react-query mutation
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleSnooze = (task: TaskWithTags) => {
    const base = task.dueAt ? new Date(task.dueAt) : today.now;
    const tomorrow = addZonedDays(base, 1, today.timeZone);
    const parts = getZonedParts(tomorrow, today.timeZone);
    const existing = task.dueAt ? getZonedParts(new Date(task.dueAt), today.timeZone) : null;

    const dueAt = zonedWallClockToUtc(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: task.hasDueTime && existing ? existing.hour : 12,
        minute: task.hasDueTime && existing ? existing.minute : 0,
      },
      today.timeZone,
    );

    snooze.mutate({ id: task.id, dueAt, hasDueTime: task.hasDueTime });
  };

  const handleDelete = (task: TaskWithTags) => {
    deleteTask.mutate(task.id);
  };

  if (today.isLoading) {
    return (
      <div className={styles.stateContainer}>
        <div className={styles.loadingSpinner} />
        <h2>Getting your day ready</h2>
        <p>Aligning calendar commitments and task priorities...</p>
      </div>
    );
  }

  if (today.isError) {
    return (
      <div className={styles.stateContainer} role="alert">
        <div className={styles.errorIcon}>!</div>
        <h2>We could not load your day</h2>
        <p>Please check your connection and try again.</p>
        <button type="button" className={styles.retryButton} onClick={today.refetch}>
          Try again
        </button>
      </div>
    );
  }

  // Workday capacity estimate (assumes standard 8h/480m workday or remaining free time)
  const capacityPercent = Math.min(100, Math.round((today.freeTime.freeMinutes / 480) * 100));

  return (
    <div className={styles.page}>
      {/* Dynamic Command Hero */}
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroDateRow}>
            <span className={styles.dateBadge}>{fullDateString}</span>
            <span className={styles.liveClockChip}>
              <span className={styles.pulseDot} />
              {liveTimeString}
              <span className={styles.timezoneLabel}>{today.timeZone}</span>
            </span>
          </div>
          <h1 className={styles.heroTitle}>{greeting}</h1>
          <p className={styles.heroSubtitle}>
            {today.timed.length > 0 || relevantCount > 0
              ? `You have ${today.timed.length} event${today.timed.length === 1 ? '' : 's'} and ${relevantCount} active task${relevantCount === 1 ? '' : 's'} today.`
              : 'Your schedule is clear and you have no pending tasks for today.'}
          </p>
        </div>

        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.primaryActionButton}
            onClick={() => navigate('/tasks?newTask=true')}
          >
            <PlusIcon />
            <span>New Task</span>
          </button>
          <button
            type="button"
            className={styles.secondaryActionButton}
            onClick={() => navigate(`/calendar?date=${today.todayKey}&newEvent=true`)}
          >
            <CalendarIcon />
            <span>New Event</span>
          </button>
          <button
            type="button"
            className={styles.iconSearchButton}
            onClick={() => navigate('/search')}
            title="Search (⌘K)"
            aria-label="Search"
          >
            <SearchIcon />
            <kbd className={styles.keyboardHint}>⌘K</kbd>
          </button>
        </div>
      </header>

      {/* Bento Metric Cards */}
      <section className={styles.bentoGrid} aria-label="Day Overview">
        {/* Card 1: Up Next / In Progress */}
        <div
          className={`${styles.bentoCard} ${nextStatus?.isActive ? styles.bentoCardActive : ''}`}
          onClick={() => {
            if (today.next) {
              navigate(`/calendar?date=${today.todayKey}&event=${today.next.event.id}`);
            }
          }}
          role={today.next ? 'button' : undefined}
          tabIndex={today.next ? 0 : undefined}
          onKeyDown={(e) => {
            if (today.next && (e.key === 'Enter' || e.key === ' ')) {
              navigate(`/calendar?date=${today.todayKey}&event=${today.next.event.id}`);
            }
          }}
        >
          <div className={styles.bentoCardHeader}>
            <span className={styles.bentoEyebrow}>
              {nextStatus?.isActive ? (
                <span className={styles.activePill}>
                  <span className={styles.livePulse} />
                  Happening Now
                </span>
              ) : today.next ? (
                nextStatus && nextStatus.diffMinutes <= 60 ? (
                  <span className={styles.soonPill}>In {nextStatus.diffMinutes}m</span>
                ) : (
                  'Up Next'
                )
              ) : (
                'Up Next'
              )}
            </span>
            <div className={`${styles.bentoIconBadge} ${styles.bentoIconClock}`}>
              <ClockIcon className={styles.bentoIcon} />
            </div>
          </div>
          <div className={styles.bentoCardBody}>
            <strong className={styles.bentoMainValue}>
              {today.next?.event.title ?? 'No upcoming events'}
            </strong>
            <p className={styles.bentoMeta}>
              {today.next ? (
                <>
                  <span
                    className={styles.calendarDot}
                    style={{ backgroundColor: today.next.calendar?.color ?? 'var(--color-accent)' }}
                  />
                  <span>
                    {formatTimeOfDay(new Date(today.next.start), today.timeZone, today.hourCycle)} –{' '}
                    {formatTimeOfDay(new Date(today.next.end), today.timeZone, today.hourCycle)}
                  </span>
                  {today.next.event.location && (
                    <span className={styles.locationTag}>· {today.next.event.location}</span>
                  )}
                </>
              ) : (
                'Schedule is open for deep work'
              )}
            </p>
          </div>
          {today.next && <div className={styles.cardActionHint}>View in calendar →</div>}
        </div>

        {/* Card 2: Work Capacity & Focus */}
        <div className={styles.bentoCard}>
          <div className={styles.bentoCardHeader}>
            <span className={styles.bentoEyebrow}>Focus Capacity</span>
            <div className={`${styles.bentoIconBadge} ${styles.bentoIconFocus}`}>
              <FocusIcon className={styles.bentoIcon} />
            </div>
          </div>
          <div className={styles.bentoCardBody}>
            <strong className={styles.bentoMainValue}>
              {today.freeTime.freeMinutes > 0
                ? `${formatDuration(today.freeTime.freeMinutes)} free`
                : 'Fully booked'}
            </strong>
            <p className={styles.bentoMeta}>
              {today.freeTime.intervals.length > 0
                ? `${today.freeTime.intervals.length} open block${today.freeTime.intervals.length === 1 ? '' : 's'} inside working hours`
                : 'No remaining open windows today'}
            </p>
          </div>
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFillCapacity}
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
            <span className={styles.progressLabel}>{capacityPercent}% open</span>
          </div>
        </div>

        {/* Card 3: Task Velocity & Progress */}
        <div className={styles.bentoCard}>
          <div className={styles.bentoCardHeader}>
            <span className={styles.bentoEyebrow}>
              {today.overdue.length > 0 ? (
                <span className={styles.overduePill}>{today.overdue.length} Overdue</span>
              ) : totalTasks > 0 && today.completedToday.length === totalTasks ? (
                <span className={styles.donePill}>All Caught Up</span>
              ) : (
                'Task Pulse'
              )}
            </span>
            <div className={`${styles.bentoIconBadge} ${styles.bentoIconTasks}`}>
              <CheckCircleIcon className={styles.bentoIcon} />
            </div>
          </div>
          <div className={styles.bentoCardBody}>
            <strong className={styles.bentoMainValue}>
              {totalTasks > 0 ? `${today.completedToday.length} of ${totalTasks} done` : 'No tasks'}
            </strong>
            <p className={styles.bentoMeta}>
              {today.dueToday.length > 0
                ? `${today.dueToday.length} due today`
                : today.overdue.length > 0
                  ? `${today.overdue.length} needing attention`
                  : totalTasks > 0
                    ? 'All daily commitments completed!'
                    : 'Clear task queue'}
            </p>
          </div>
          <div className={styles.progressContainer}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFillTasks}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <span className={styles.progressLabel}>{completionPercentage}%</span>
          </div>
        </div>
      </section>

      {/* Main Split Content: Schedule vs Tasks */}
      <div className={styles.columns}>
        {/* Left Column: Schedule & Timeline */}
        <section className={styles.section} aria-labelledby={scheduleHeadingId}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleRow}>
              <h2 id={scheduleHeadingId} className={styles.sectionHeading}>
                Schedule
              </h2>
              <span className={styles.countBadge}>{today.allDay.length + today.timed.length}</span>
            </div>
            <button
              type="button"
              className={styles.textNavButton}
              onClick={() => navigate(`/calendar?date=${today.todayKey}`)}
            >
              Full calendar →
            </button>
          </div>

          {/* All-Day Events */}
          {today.allDay.length > 0 && (
            <div className={styles.allDayBlock}>
              <span className={styles.allDayLabel}>All-Day</span>
              <div className={styles.allDayList}>
                {today.allDay.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.allDayPill}
                    onClick={() =>
                      navigate(`/calendar?date=${today.todayKey}&event=${item.event.id}`)
                    }
                  >
                    <span
                      className={styles.allDayDot}
                      style={{ backgroundColor: item.calendar?.color ?? 'var(--color-accent)' }}
                    />
                    <span className={styles.allDayTitle}>{item.event.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Timeline */}
          {today.timed.length === 0 ? (
            <div className={styles.emptySchedule}>
              <CalendarEmptyIcon />
              <h3>Your schedule is clear</h3>
              <p>No timed commitments today. Enjoy uninterrupted focus time.</p>
              <button
                type="button"
                className={styles.secondaryActionButton}
                onClick={() => navigate(`/calendar?date=${today.todayKey}&newEvent=true`)}
              >
                + Schedule Event
              </button>
            </div>
          ) : (
            <div className={styles.timeline}>
              {today.timed.map((item) => {
                const nowMs = today.now.getTime();
                const isCurrent = nowMs >= item.start && nowMs < item.end;
                const isPast = nowMs >= item.end;
                const durationMins = Math.round((item.end - item.start) / 60000);
                const startTimeStr = formatTimeOfDay(
                  new Date(item.start),
                  today.timeZone,
                  today.hourCycle,
                );
                const endTimeStr = formatTimeOfDay(
                  new Date(item.end),
                  today.timeZone,
                  today.hourCycle,
                );

                return (
                  <div
                    key={item.key}
                    className={`${styles.timelineEntry} ${isCurrent ? styles.timelineCurrent : ''} ${
                      isPast ? styles.timelinePast : ''
                    }`}
                  >
                    <div className={styles.timelineTimeCol}>
                      <time className={styles.timelineTime}>{startTimeStr}</time>
                      <span className={styles.timelineDuration}>
                        {formatDuration(durationMins)}
                      </span>
                    </div>

                    <div className={styles.timelineSpine}>
                      <div
                        className={styles.timelineNode}
                        style={{
                          borderColor: item.calendar?.color ?? 'var(--color-accent)',
                          backgroundColor: isCurrent
                            ? (item.calendar?.color ?? 'var(--color-accent)')
                            : undefined,
                        }}
                      />
                      <div className={styles.timelineLine} />
                    </div>

                    <button
                      type="button"
                      className={styles.eventCard}
                      onClick={() =>
                        navigate(`/calendar?date=${today.todayKey}&event=${item.event.id}`)
                      }
                    >
                      <div
                        className={styles.eventCardColorBar}
                        style={{ backgroundColor: item.calendar?.color ?? 'var(--color-accent)' }}
                      />
                      <div className={styles.eventCardContent}>
                        <div className={styles.eventCardTop}>
                          <strong className={styles.eventCardTitle}>{item.event.title}</strong>
                          {isCurrent && (
                            <span className={styles.liveBadge}>
                              <span className={styles.livePulse} />
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className={styles.eventCardMeta}>
                          <span className={styles.eventCardRange}>
                            {startTimeStr} – {endTimeStr}
                          </span>
                          <span className={styles.eventCalendarTag}>
                            {item.calendar?.name ?? 'Calendar'}
                          </span>
                          {item.event.location && (
                            <span className={styles.eventLocationTag}>
                              📍 {item.event.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Tasks Focus */}
        <section className={styles.section} aria-labelledby={tasksHeadingId}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitleRow}>
              <h2 id={tasksHeadingId} className={styles.sectionHeading}>
                Today's Tasks
              </h2>
              <span className={styles.countBadge}>{relevantCount}</span>
            </div>
            <button
              type="button"
              className={styles.quickAddTriggerButton}
              onClick={handleOpenQuickAdd}
            >
              + Quick Add
            </button>
          </div>

          {/* Inline Quick Add Task Accordion */}
          <div
            className={`${styles.quickAddAccordion} ${
              isQuickAddOpen ? styles.quickAddAccordionOpen : ''
            }`}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows') {
                if (isQuickAddOpen) {
                  setIsQuickAddFullyOpen(true);
                }
              }
            }}
          >
            <div
              className={`${styles.quickAddAccordionInner} ${
                isQuickAddFullyOpen ? styles.quickAddAccordionInnerOpen : ''
              }`}
            >
              <form className={styles.quickAddBox} onSubmit={handleSubmitQuickAdd}>
                <input
                  ref={quickInputRef}
                  type="text"
                  className={styles.quickAddInput}
                  placeholder="What needs doing today? (Press Enter to add)"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') handleCancelQuickAdd();
                  }}
                  disabled={isSubmittingTask}
                />
                <div className={styles.quickAddOptionsRow}>
                  <div className={styles.quickAddControlsGroup}>
                    {today.lists.length > 0 && (
                      <Select
                        className={styles.quickSelect}
                        size="sm"
                        value={quickListId}
                        options={listOptions}
                        onChange={(val) => setQuickListId(val)}
                        disabled={isSubmittingTask}
                        ariaLabel="Task list"
                      />
                    )}
                    <Select
                      className={styles.quickSelect}
                      size="sm"
                      value={quickPriority}
                      options={priorityOptions}
                      onChange={(val) => setQuickPriority(val as TaskPriority)}
                      disabled={isSubmittingTask}
                      ariaLabel="Task priority"
                    />
                  </div>

                  <div className={styles.quickAddActionButtons}>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={handleCancelQuickAdd}
                      disabled={isSubmittingTask}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className={styles.submitButton}
                      disabled={!quickTitle.trim() || isSubmittingTask}
                    >
                      {isSubmittingTask ? 'Adding...' : 'Add Task'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Task Groups */}
          {relevantCount === 0 ? (
            <div className={styles.emptyTasks}>
              <TasksEmptyIcon />
              <h3>No tasks for today</h3>
              <p>You have no overdue items or tasks due today.</p>
              <button
                type="button"
                className={styles.secondaryActionButton}
                onClick={handleOpenQuickAdd}
              >
                + Add a Task
              </button>
            </div>
          ) : (
            <div className={styles.taskGroupsList}>
              {/* Overdue Section */}
              {today.overdue.length > 0 && (
                <div className={styles.taskSection}>
                  <div className={styles.taskSectionHeaderOverdue}>
                    <AlertTriangleIcon />
                    <span>Overdue</span>
                    <span className={styles.taskSectionBadgeOverdue}>{today.overdue.length}</span>
                  </div>
                  {today.overdue.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      lists={today.lists}
                      now={today.now}
                      timeZone={today.timeZone}
                      hourCycle={today.hourCycle}
                      onOpen={(id) => navigate(`/tasks?task=${id}`)}
                      onToggle={(t, c) => toggle.mutate({ id: t.id, completed: c })}
                      onSnooze={handleSnooze}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}

              {/* Due Today Section */}
              {today.dueToday.length > 0 && (
                <div className={styles.taskSection}>
                  <div className={styles.taskSectionHeader}>
                    <span>Due Today</span>
                    <span className={styles.taskSectionBadge}>{today.dueToday.length}</span>
                  </div>
                  {today.dueToday.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      lists={today.lists}
                      now={today.now}
                      timeZone={today.timeZone}
                      hourCycle={today.hourCycle}
                      onOpen={(id) => navigate(`/tasks?task=${id}`)}
                      onToggle={(t, c) => toggle.mutate({ id: t.id, completed: c })}
                      onSnooze={handleSnooze}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}

              {/* Unscheduled / Flexible Section */}
              {today.unscheduled.length > 0 && (
                <div className={styles.taskSection}>
                  <div className={styles.taskSectionHeader}>
                    <span>Flexible Focus</span>
                    <span className={styles.taskSectionBadge}>{today.unscheduled.length}</span>
                  </div>
                  {today.unscheduled.map((task) => (
                    <TodayTaskRow
                      key={task.id}
                      task={task}
                      lists={today.lists}
                      now={today.now}
                      timeZone={today.timeZone}
                      hourCycle={today.hourCycle}
                      onOpen={(id) => navigate(`/tasks?task=${id}`)}
                      onToggle={(t, c) => toggle.mutate({ id: t.id, completed: c })}
                      onSnooze={handleSnooze}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed Today Collapsible Section */}
          {today.completedToday.length > 0 && (
            <details className={styles.completedCollapsible}>
              <summary className={styles.completedSummary}>
                <span className={styles.completedSummaryLeft}>
                  <CheckIcon className={styles.checkIconGreen} />
                  <span>Completed today</span>
                  <span className={styles.completedCountBadge}>{today.completedToday.length}</span>
                </span>
                <ChevronDownIcon className={styles.chevronIcon} />
              </summary>
              <div className={styles.completedList}>
                {today.completedToday.map((task) => (
                  <TodayTaskRow
                    key={task.id}
                    task={task}
                    lists={today.lists}
                    now={today.now}
                    timeZone={today.timeZone}
                    hourCycle={today.hourCycle}
                    onOpen={(id) => navigate(`/tasks?task=${id}`)}
                    onToggle={(t, c) => toggle.mutate({ id: t.id, completed: c })}
                    onSnooze={handleSnooze}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}

interface TodayTaskRowProps {
  task: TaskWithTags;
  lists: TaskList[];
  now: Date;
  timeZone: string;
  hourCycle: 'h12' | 'h23';
  onOpen: (id: string) => void;
  onToggle: (task: TaskWithTags, completed: boolean) => void;
  onSnooze: (task: TaskWithTags) => void;
  onDelete: (task: TaskWithTags) => void;
}

function TodayTaskRow({
  task,
  lists,
  now,
  timeZone,
  hourCycle,
  onOpen,
  onToggle,
  onSnooze,
  onDelete,
}: TodayTaskRowProps) {
  const isCompleted = task.status === 'completed';
  const list = lists.find((l) => l.id === task.listId);
  const dueInfo = describeTaskDue(task, { now, timeZone, hourCycle });

  return (
    <div className={`${styles.taskRow} ${isCompleted ? styles.taskRowCompleted : ''}`}>
      <button
        type="button"
        className={`${styles.taskCheckbox} ${isCompleted ? styles.taskCheckboxChecked : ''}`}
        onClick={() => onToggle(task, !isCompleted)}
        aria-label={isCompleted ? `Mark incomplete: ${task.title}` : `Complete: ${task.title}`}
      >
        {isCompleted && <CheckIcon />}
      </button>

      <button
        type="button"
        className={styles.taskContentButton}
        onClick={() => onOpen(task.id)}
        aria-label={`Open task details: ${task.title}`}
      >
        <span className={styles.taskTitle}>{task.title}</span>
        <div className={styles.taskBadges}>
          {list && (
            <span className={styles.listPill}>
              <span className={styles.listPillDot} style={{ backgroundColor: list.color }} />
              {list.name}
            </span>
          )}

          {isNotablePriority(task.priority) && (
            <span
              className={`${styles.priorityPill} ${
                task.priority === 'urgent'
                  ? styles.priorityUrgent
                  : task.priority === 'high'
                    ? styles.priorityHigh
                    : styles.priorityLow
              }`}
            >
              {PRIORITY_LABELS[task.priority]}
            </span>
          )}

          {dueInfo.tone !== 'none' && !isCompleted && (
            <span
              className={`${styles.duePill} ${
                dueInfo.tone === 'overdue'
                  ? styles.dueOverdue
                  : dueInfo.tone === 'today'
                    ? styles.dueToday
                    : styles.dueSoon
              }`}
            >
              {dueInfo.text}
            </span>
          )}

          {task.estimatedMinutes !== null && task.estimatedMinutes > 0 && (
            <span className={styles.durationPill}>⏱ {formatDuration(task.estimatedMinutes)}</span>
          )}
        </div>
      </button>

      <div className={styles.taskActions}>
        <button
          type="button"
          className={styles.taskActionBtn}
          title="Snooze to tomorrow"
          onClick={() => onSnooze(task)}
        >
          <ClockSnoozeIcon />
        </button>
        <button
          type="button"
          className={`${styles.taskActionBtn} ${styles.taskActionBtnDanger}`}
          title="Delete task"
          onClick={() => onDelete(task)}
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// Sleek SVG Icons
function PlusIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.16" />
      <polyline points="12 6 12 12 16 14" strokeWidth="2.2" />
    </svg>
  );
}

function FocusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1" />
      <circle cx="12" cy="12" r="6" fill="currentColor" fillOpacity="0.18" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" fill="currentColor" fillOpacity="0.16" />
      <polyline points="22 4 12 14.01 9 11.01" strokeWidth="2.2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ClockSnoozeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 10" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CalendarEmptyIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-tertiary)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <circle cx="12" cy="15" r="2" />
    </svg>
  );
}

function TasksEmptyIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-text-tertiary)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}
