import { describeTaskDue, formatDuration, formatTimeOfDay } from '@cal/domain';
import type { TaskList } from '@cal/schemas';
import { useNavigate } from 'react-router-dom';

import styles from './TodayView.module.css';
import type { TaskWithTags } from '../../tasks/api/tasks.api';
import { useToggleTaskComplete } from '../../tasks/hooks/useTasks';
import { useToday } from '../hooks/useToday';

export function TodayView() {
  const today = useToday();
  const navigate = useNavigate();
  const toggle = useToggleTaskComplete();

  if (today.isLoading)
    return <State title="Getting your day ready" body="Loading tasks and calendar commitments." />;
  if (today.isError)
    return (
      <State
        title="We could not load your day"
        body="Check your connection and try again."
        action={today.refetch}
      />
    );

  const heading = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: today.timeZone,
  }).format(today.now);
  const firstName = today.profile?.fullName?.split(' ')[0];
  const relevantCount = today.overdue.length + today.dueToday.length + today.unscheduled.length;
  const isEmpty = today.allDay.length + today.timed.length + relevantCount === 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.date}>{heading}</span>
          <h2>{firstName ? `Hello, ${firstName}` : 'Your day'}</h2>
          <p>Commitments and work, grounded in {today.timeZone}.</p>
        </div>
        <button type="button" className={styles.searchButton} onClick={() => navigate('/search')}>
          Search
        </button>
      </header>

      <div className={styles.summaryStrip}>
        <div>
          <span>Up next</span>
          <strong>{today.next?.event.title ?? 'Your day is open'}</strong>
          <small>
            {today.next
              ? formatTimeOfDay(new Date(today.next.start), today.timeZone, today.hourCycle)
              : 'No upcoming timed events'}
          </small>
        </div>
        <div>
          <span>Open work time</span>
          <strong>
            {today.freeTime.freeMinutes > 0
              ? `${formatDuration(today.freeTime.freeMinutes)} free`
              : 'No open time'}
          </strong>
          <small>
            {today.freeTime.intervals.length} remaining window
            {today.freeTime.intervals.length === 1 ? '' : 's'}
          </small>
        </div>
        <div>
          <span>Task focus</span>
          <strong>
            {relevantCount} item{relevantCount === 1 ? '' : 's'}
          </strong>
          <small>
            {today.overdue.length ? `${today.overdue.length} overdue` : 'Nothing overdue'}
          </small>
        </div>
      </div>

      {isEmpty ? (
        <State title="A clear day" body="There are no visible events or task pressure for today." />
      ) : (
        <div className={styles.columns}>
          <section className={styles.section} aria-labelledby="today-schedule">
            <SectionTitle
              id="today-schedule"
              title="Schedule"
              count={today.allDay.length + today.timed.length}
            />
            {today.allDay.length > 0 && (
              <div className={styles.allDay}>
                <span className={styles.allDayLabel}>All day</span>
                <div>
                  {today.allDay.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() =>
                        navigate(`/calendar?date=${today.todayKey}&event=${item.event.id}`)
                      }
                    >
                      <i style={{ background: item.calendar?.color }} />
                      {item.event.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {today.timed.length === 0 ? (
              <p className={styles.inlineEmpty}>No timed events today.</p>
            ) : (
              <div className={styles.timeline}>
                {today.timed.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.eventRow}
                    onClick={() =>
                      navigate(`/calendar?date=${today.todayKey}&event=${item.event.id}`)
                    }
                  >
                    <time>
                      {formatTimeOfDay(new Date(item.start), today.timeZone, today.hourCycle)}
                    </time>
                    <i style={{ background: item.calendar?.color }} />
                    <span>
                      <strong>{item.event.title}</strong>
                      <small>
                        {item.calendar?.name ?? 'Calendar'}
                        {item.event.location ? ` · ${item.event.location}` : ''}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className={styles.section} aria-labelledby="today-tasks">
            <SectionTitle id="today-tasks" title="Tasks" count={relevantCount} />
            {relevantCount === 0 ? (
              <p className={styles.inlineEmpty}>No task pressure today.</p>
            ) : (
              <div className={styles.taskGroups}>
                <TaskGroup
                  title="Overdue"
                  tasks={today.overdue}
                  {...today}
                  onOpen={(id) => navigate(`/tasks?task=${id}`)}
                  onToggle={(task, completed) => toggle.mutate({ id: task.id, completed })}
                />
                <TaskGroup
                  title="Due today"
                  tasks={today.dueToday}
                  {...today}
                  onOpen={(id) => navigate(`/tasks?task=${id}`)}
                  onToggle={(task, completed) => toggle.mutate({ id: task.id, completed })}
                />
                <TaskGroup
                  title="Unscheduled"
                  tasks={today.unscheduled}
                  {...today}
                  onOpen={(id) => navigate(`/tasks?task=${id}`)}
                  onToggle={(task, completed) => toggle.mutate({ id: task.id, completed })}
                />
              </div>
            )}
            {today.completedToday.length > 0 && (
              <details className={styles.completed}>
                <summary>{today.completedToday.length} completed today</summary>
                <TaskGroup
                  title=""
                  tasks={today.completedToday}
                  {...today}
                  onOpen={(id) => navigate(`/tasks?task=${id}`)}
                  onToggle={(task, completed) => toggle.mutate({ id: task.id, completed })}
                />
              </details>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <div className={styles.sectionTitle}>
      <h3 id={id}>{title}</h3>
      <span>{count}</span>
    </div>
  );
}
function State({ title, body, action }: { title: string; body: string; action?: () => void }) {
  return (
    <div className={styles.state} role={action ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <span>{body}</span>
      {action && (
        <button type="button" onClick={action}>
          Try again
        </button>
      )}
    </div>
  );
}
function TaskGroup({
  title,
  tasks,
  lists,
  now,
  timeZone,
  hourCycle,
  onOpen,
  onToggle,
}: {
  title: string;
  tasks: TaskWithTags[];
  lists: TaskList[];
  now: Date;
  timeZone: string;
  hourCycle: 'h12' | 'h23';
  onOpen: (id: string) => void;
  onToggle: (task: TaskWithTags, completed: boolean) => void;
}) {
  if (!tasks.length) return null;
  return (
    <div className={styles.taskGroup}>
      {title && <h4>{title}</h4>}
      {tasks.map((task) => {
        const list = lists.find((item) => item.id === task.listId);
        const completed = task.status === 'completed';
        return (
          <div className={`${styles.taskRow} ${completed ? styles.taskDone : ''}`} key={task.id}>
            <button
              type="button"
              className={styles.check}
              onClick={() => onToggle(task, !completed)}
              aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
            >
              {completed ? '✓' : ''}
            </button>
            <button type="button" className={styles.taskCopy} onClick={() => onOpen(task.id)}>
              <strong>{task.title}</strong>
              <small>
                {list?.name ?? 'Inbox'} ·{' '}
                {completed
                  ? 'Completed'
                  : describeTaskDue(task, { now, timeZone, hourCycle }).text || 'No due time'}
              </small>
            </button>
          </div>
        );
      })}
    </div>
  );
}
