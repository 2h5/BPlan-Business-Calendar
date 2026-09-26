import { useId, type CSSProperties } from 'react';

import styles from './SearchIllustration.module.css';

/**
 * The idle-state artwork for search surfaces: task and event cards under a
 * magnifying glass. Colours come from theme tokens, so it follows light and dark.
 */
export function SearchIllustration({ width = 240 }: { width?: number }) {
  // Unique ids keep the filter and gradient from colliding if two copies render.
  const id = useId();
  const shadowId = `${id}-shadow`;
  const lensId = `${id}-lens`;

  return (
    <svg
      className={styles.art}
      style={{ '--art-width': `${width}px` } as CSSProperties}
      viewBox="0 0 240 170"
      width={width}
      height={(width * 170) / 240}
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.28" />
        </filter>
        <linearGradient id={lensId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {/* Soft backdrop */}
      <path
        className={styles.blob}
        d="M70 44c16-22 52-30 82-24 30 6 46 26 50 52 4 26-4 50-28 64-24 14-62 18-90 8-28-10-44-32-44-56 0-16 14-30 30-44Z"
      />

      {/* Decorations */}
      <circle className={`${styles.accentFill} ${styles.pulse}`} cx="54" cy="42" r="3.2" />
      <circle className={`${styles.dot} ${styles.pulse}`} cx="58" cy="122" r="2.6" />
      <path
        className={`${styles.accentFill} ${styles.twinkle}`}
        d="M208 58c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8Z"
      />

      {/* Back card */}
      <g className={styles.floatSlow}>
        <rect className={styles.cardBack} x="92" y="24" width="78" height="42" rx="7" />
        <rect className={styles.lineBack} x="104" y="36" width="34" height="4" rx="2" />
        <rect className={styles.lineBack} x="104" y="45" width="22" height="4" rx="2" />
      </g>

      {/* Event card */}
      <g className={styles.floatSlow}>
        <rect className={styles.cardBack} x="84" y="104" width="86" height="36" rx="7" />
        <rect className={styles.calendarIcon} x="95" y="114" width="15" height="15" rx="3" />
        <path className={styles.calendarLines} d="M95 119h15M99 112v4M106 112v4" />
        <rect className={styles.lineBack} x="118" y="115" width="40" height="4" rx="2" />
        <rect className={styles.lineBack} x="118" y="124" width="26" height="4" rx="2" />
      </g>

      {/* Task card */}
      <g className={styles.float} filter={`url(#${shadowId})`}>
        <rect className={styles.cardFront} x="66" y="60" width="100" height="40" rx="7" />
        <rect className={styles.accentFill} x="77" y="72" width="16" height="16" rx="4" />
        <path
          d="m81 80.2 2.8 2.8 5.4-5.8"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect className={styles.lineFront} x="101" y="73" width="48" height="4" rx="2" />
        <rect className={styles.lineFront} x="101" y="83" width="32" height="4" rx="2" />
      </g>

      {/* Magnifying glass */}
      <g className={styles.magnifier}>
        <path className={styles.spark} d="M170 30l3-8M181 36l7-5" />
        <path className={styles.handle} d="M177 87l17 17" />
        <circle className={styles.lens} cx="160" cy="70" r="22" />
        <circle cx="160" cy="70" r="22" fill={`url(#${lensId})`} />
        <circle className={styles.rim} cx="160" cy="70" r="22" />
        <path className={styles.glint} d="M147 62a15 15 0 0 1 9-8" />
      </g>
    </svg>
  );
}
