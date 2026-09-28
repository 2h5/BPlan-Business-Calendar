import { useState, type CSSProperties } from 'react';

import { CalendarMorph, type CalendarMode } from './CalendarMorph';
import demo from './demo.module.css';
import styles from './ViewsScene.module.css';
import { useSequence } from '../hooks/useScenePlayback';

const MODES: readonly CalendarMode[] = ['week', 'day', 'month'];
const HOLDS = [3400, 3000, 3400] as const;
const LABELS: Record<CalendarMode, string> = { day: 'Day', week: 'Week', month: 'Month' };

/**
 * Day, week, and month on one calendar. It tours the three views on its own
 * until the visitor picks one, then stays where they put it.
 */
export function ViewsScene({ playing, revealed }: { playing: boolean; revealed: boolean }) {
  const [chosen, setChosen] = useState<CalendarMode | null>(null);
  const step = useSequence(HOLDS, playing && chosen === null);
  const mode = chosen ?? MODES[step] ?? 'week';
  const index = (['day', 'week', 'month'] as const).indexOf(mode);

  return (
    <div className={`${demo.surface} ${styles.panel}`}>
      <div className={styles.toolbar}>
        <span className={styles.month}>
          October <span>2026</span>
        </span>
        <div
          className={styles.segmented}
          role="group"
          aria-label="Calendar view"
          style={{ '--index': index } as CSSProperties}
        >
          <span className={styles.thumb} aria-hidden="true" />
          {(['day', 'week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              data-active={mode === option}
              onClick={() => setChosen(option)}
            >
              {LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <CalendarMorph mode={mode} revealed={revealed} className={styles.board} />
    </div>
  );
}
