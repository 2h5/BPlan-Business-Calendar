import type { CSSProperties } from 'react';

import styles from './ProgressRing.module.css';

export interface ProgressRingProps {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
}

/** A circular "done of total" meter, the web twin of mobile's ProgressRing. */
export function ProgressRing({ done, total, size = 56, stroke = 5 }: ProgressRingProps) {
  const fraction = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const complete = total > 0 && done >= total;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={`${styles.ring} ${complete ? styles.ringComplete : ''}`}
      style={{ width: size, height: size, '--ring-circumference': circumference } as CSSProperties}
      role="progressbar"
      aria-label={total > 0 ? `${done} of ${total} tasks done` : 'No tasks today'}
      aria-valuemin={0}
      aria-valuemax={Math.max(total, 1)}
      aria-valuenow={done}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          className={styles.ringTrack}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className={styles.ringFill}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className={styles.ringLabel}>
        {complete ? '✓' : total > 0 ? `${done}/${total}` : '–'}
      </span>
    </div>
  );
}
