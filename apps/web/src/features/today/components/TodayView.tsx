import { addZonedDays, getZonedParts, zonedWallClockToUtc } from '@cal/domain';
import type { TaskPriority } from '@cal/schemas';
import React, { useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DayGlanceCard } from './DayGlanceCard';
import { ProgressRing } from './ProgressRing';
import { CalendarIcon, MoonIcon, PlusIcon, SunIcon } from './TodayIcons';
import { TodayScheduleSection } from './TodayScheduleSection';
import { TodaySearch } from './TodaySearch';
import { TodayTaskGroups } from './TodayTaskGroups';
import styles from './TodayView.module.css';
import { Select } from '../../../components/forms/Select';
import { FindTimeBox } from '../../scheduling';
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
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

  const isDaytime = localParts.hour >= 5 && localParts.hour < 17;

  const fullDateString = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: today.timeZone,
    }).format(today.now);
  }, [today.now, today.timeZone]);

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

  return (
    <div className={`${styles.page} ${isDaytime ? styles.day : styles.night}`}>
      {/* Dynamic Command Hero */}
      <header className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.heroDateRow}>
            <span className={styles.dateBadge}>{fullDateString}</span>
          </div>
          <h1 className={styles.heroTitle}>
            {greeting}
            <span
              className={`${styles.timeOfDay} ${isDaytime ? styles.timeOfDaySun : styles.timeOfDayMoon}`}
            >
              {isDaytime ? (
                <SunIcon className={styles.timeOfDayIcon} />
              ) : (
                <MoonIcon className={styles.timeOfDayIcon} />
              )}
            </span>
          </h1>
          <p className={styles.heroSubtitle}>
            {today.timed.length > 0 || relevantCount > 0
              ? `You have ${today.timed.length} event${today.timed.length === 1 ? '' : 's'} and ${relevantCount} active task${relevantCount === 1 ? '' : 's'} today.`
              : 'Your schedule is clear and you have no pending tasks for today.'}
          </p>
        </div>

        <div className={styles.heroActions}>
          <div
            className={styles.heroActionButtons}
            aria-hidden={isSearchOpen}
            inert={isSearchOpen ? true : undefined}
          >
            <button
              type="button"
              className={styles.primaryActionButton}
              onClick={() => navigate(`/calendar?date=${today.todayKey}&newEvent=true`)}
            >
              <CalendarIcon />
              <span>New Event</span>
            </button>
            <button
              type="button"
              className={styles.secondaryActionButton}
              onClick={() => navigate('/tasks?newTask=true')}
            >
              <PlusIcon />
              <span>New Task</span>
            </button>
          </div>

          <TodaySearch isOpen={isSearchOpen} onOpenChange={setIsSearchOpen} />
        </div>
      </header>

      <FindTimeBox timeZone={today.timeZone} />

      {/* Day overview: the glance card mirrors mobile; tasks keep their own card */}
      <section className={styles.bentoGrid} aria-label="Day Overview">
        <div className={styles.glanceCell}>
          <DayGlanceCard
            today={today}
            onOpenEvent={(eventId) => navigate(`/calendar?date=${today.todayKey}&event=${eventId}`)}
          />
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
          </div>
          <div className={styles.taskPulseRow}>
            <div className={styles.bentoCardBody}>
              <strong className={styles.bentoMainValue}>
                {totalTasks > 0
                  ? `${today.completedToday.length} of ${totalTasks} done`
                  : 'No tasks'}
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
            <ProgressRing done={today.completedToday.length} total={totalTasks} />
          </div>
        </div>
      </section>

      {/* Main Split Content: Schedule vs Tasks */}
      <div className={styles.columns}>
        {/* Left Column: Schedule & Timeline */}
        <TodayScheduleSection
          headingId={scheduleHeadingId}
          allDay={today.allDay}
          timed={today.timed}
          now={today.now}
          timeZone={today.timeZone}
          hourCycle={today.hourCycle}
          onOpenCalendar={() => navigate(`/calendar?date=${today.todayKey}`)}
          onCreateEvent={() => navigate(`/calendar?date=${today.todayKey}&newEvent=true`)}
          onOpenEvent={(eventId) => navigate(`/calendar?date=${today.todayKey}&event=${eventId}`)}
        />

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
          <TodayTaskGroups
            overdue={today.overdue}
            dueToday={today.dueToday}
            unscheduled={today.unscheduled}
            completedToday={today.completedToday}
            lists={today.lists}
            now={today.now}
            timeZone={today.timeZone}
            hourCycle={today.hourCycle}
            relevantCount={relevantCount}
            isCompletedOpen={isCompletedOpen}
            onToggleCompleted={() => setIsCompletedOpen((prev) => !prev)}
            onAddTask={handleOpenQuickAdd}
            onOpenTask={(id) => navigate(`/tasks?task=${id}`)}
            onToggleTask={(task, completed) => toggle.mutate({ id: task.id, completed })}
            onSnoozeTask={handleSnooze}
            onDeleteTask={handleDelete}
          />
        </section>
      </div>
    </div>
  );
}
