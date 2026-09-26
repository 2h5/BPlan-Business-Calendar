import type { CSSProperties } from 'react';

import styles from './LoginBackdrop.module.css';

/**
 * Grid cells (column from the page centre, row from the top, height in rows).
 * Columns 0-1 and the top rows are the open gap between the hero and the
 * sign-in card at every desktop width.
 */
const EVENTS = [
  { col: 1, row: 1, span: 1 },
  { col: 0, row: 3, span: 1.5 },
  { col: 1, row: 5, span: 1 },
  { col: 0, row: 7, span: 1 },
] as const;

/**
 * The login page's backdrop: a faint week grid that drifts slowly upward,
 * with an occasional event softly filling in a cell and fading away.
 */
export function LoginBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.grid}>
        {EVENTS.map(({ col, row, span }, index) => (
          <span
            key={index}
            className={styles.event}
            style={{ '--col': col, '--row': row, '--span': span } as CSSProperties}
          />
        ))}
      </div>
    </div>
  );
}
