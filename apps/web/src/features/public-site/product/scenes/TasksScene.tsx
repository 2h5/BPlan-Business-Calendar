import type { CSSProperties } from 'react';

import demo from './demo.module.css';
import styles from './TasksScene.module.css';
import { DEMO_COLORS, type DemoColor } from '../demo-data';
import { usePrefersReducedMotion, useSequence, useTypedCount } from '../hooks/useScenePlayback';

type Priority = 'urgent' | 'high' | 'normal' | 'low';

interface DemoTask {
  id: string;
  title: string;
  priority: Priority;
  list: { name: string; color: DemoColor };
  due: string;
  estimate?: string;
}

const LAUNCH = { name: 'Launch', color: 'periwinkle' } as const;
const TEAM = { name: 'Team', color: 'apricot' } as const;
const HOME = { name: 'Personal', color: 'mint' } as const;

const TASKS: readonly DemoTask[] = [
  {
    id: 'notes',
    title: 'Send launch notes',
    priority: 'high',
    list: LAUNCH,
    due: 'Today',
    estimate: '20 min',
  },
  { id: 'budget', title: 'Review Q4 budget', priority: 'urgent', list: TEAM, due: 'Today, 3 PM' },
  {
    id: 'rubric',
    title: 'Draft hiring rubric',
    priority: 'normal',
    list: TEAM,
    due: 'Tomorrow',
    estimate: '45 min',
  },
  { id: 'dentist', title: 'Book the dentist', priority: 'low', list: HOME, due: 'Fri' },
];

const NEW_TASK: DemoTask = {
  id: 'slides',
  title: 'Prep slides for Thursday',
  priority: 'normal',
  list: LAUNCH,
  due: 'Thu',
  estimate: '1 h',
};

const PRIORITY_LABEL: Partial<Record<Priority, string>> = {
  urgent: 'Urgent',
  high: 'High',
  low: 'Low',
};

const Step = { Rest: 0, Check: 1, Clear: 2, Type: 3, Added: 4, Reset: 5 } as const;
const TYPE_MS = 45;
const HOLDS = [1800, 900, 900, NEW_TASK.title.length * TYPE_MS + 400, 2600, 700];

/**
 * A task list in motion: the top task is ticked off and folds away, then a
 * new one is typed in and lands with its list, due date, and estimate.
 */
export function TasksScene({ playing }: { playing: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const sequenced = useSequence(HOLDS, playing && !reducedMotion);
  const step: number = reducedMotion ? Step.Rest : sequenced;
  const typed = useTypedCount(NEW_TASK.title, step === Step.Type, TYPE_MS);

  const done = step >= Step.Check && step < Step.Reset ? 1 : 0;
  const total = TASKS.length + (step >= Step.Added && step < Step.Reset ? 1 : 0);
  const draft = step === Step.Type ? NEW_TASK.title.slice(0, typed) : '';

  return (
    <div className={`${demo.surface} ${styles.panel}`} data-resetting={step === Step.Reset}>
      <div className={styles.header}>
        <div>
          <p className={styles.heading}>Today</p>
          <p className={styles.sub}>
            {total - done} open · {done} done
          </p>
        </div>
        <Progress value={done / total} />
      </div>

      <div className={styles.quickAdd} data-typing={step === Step.Type}>
        <span className={styles.plus}>+</span>
        {draft ? (
          <span className={styles.draft}>
            {draft}
            <span className={styles.caret} />
          </span>
        ) : (
          <span className={styles.placeholder}>Add a task</span>
        )}
      </div>

      <ul className={styles.list}>
        <TaskRow task={NEW_TASK} collapsed={step < Step.Added || step === Step.Reset} arriving />
        {TASKS.map((task, index) => (
          <TaskRow
            key={task.id}
            task={task}
            checked={index === 0 && step >= Step.Check && step < Step.Reset}
            collapsed={index === 0 && step >= Step.Clear && step < Step.Reset}
          />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({
  task,
  checked = false,
  collapsed = false,
  arriving = false,
}: {
  task: DemoTask;
  checked?: boolean;
  collapsed?: boolean;
  arriving?: boolean;
}) {
  const priority = PRIORITY_LABEL[task.priority];
  return (
    <li
      className={styles.fold}
      data-collapsed={collapsed}
      data-arriving={arriving}
      data-checked={checked}
    >
      <div className={styles.row}>
        <span className={styles.check} data-priority={task.priority} />
        <span className={styles.body}>
          <span className={styles.title}>{task.title}</span>
          <span className={styles.meta}>
            <span
              className={styles.listDot}
              style={{ '--c': DEMO_COLORS[task.list.color] } as CSSProperties}
            />
            {task.list.name}
            <span className={styles.sep}>·</span>
            {task.due}
            {task.estimate ? (
              <>
                <span className={styles.sep}>·</span>
                {task.estimate}
              </>
            ) : null}
          </span>
        </span>
        {priority ? (
          <span className={styles.badge} data-priority={task.priority}>
            {priority}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Progress({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 15;
  return (
    <svg className={styles.progress} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" />
      <circle
        cx="18"
        cy="18"
        r="15"
        style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - value) }}
      />
    </svg>
  );
}
