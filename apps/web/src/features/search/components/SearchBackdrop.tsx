import type { CSSProperties } from 'react';

import styles from './SearchBackdrop.module.css';

type StarKind = 'spark' | 'sparkOutline' | 'plus' | 'dot' | 'ring' | 'square';

interface Star {
  kind: StarKind;
  /** Position in percent of the page. */
  x: number;
  y: number;
  size: number;
  accent?: boolean;
  /** Hidden on narrow screens, where it would sit behind the search column. */
  wide?: boolean;
}

// Hand-placed so the field reads as scattered while leaving the search column clear.
const STARS: Star[] = [
  { kind: 'plus', x: 9, y: 14, size: 14, accent: true },
  { kind: 'spark', x: 15, y: 6, size: 10 },
  { kind: 'dot', x: 24, y: 15, size: 4 },
  { kind: 'spark', x: 4, y: 26, size: 9 },
  { kind: 'dot', x: 16, y: 38, size: 4, accent: true },
  { kind: 'dot', x: 26, y: 45, size: 4, wide: true },
  { kind: 'sparkOutline', x: 11, y: 47, size: 20 },
  { kind: 'sparkOutline', x: 31, y: 59, size: 16, accent: true, wide: true },
  { kind: 'dot', x: 4, y: 61, size: 4 },
  { kind: 'spark', x: 12, y: 72, size: 12, accent: true },
  { kind: 'dot', x: 7, y: 79, size: 4 },
  { kind: 'dot', x: 28, y: 78, size: 4, wide: true },
  { kind: 'spark', x: 18, y: 85, size: 12, accent: true },
  { kind: 'plus', x: 20, y: 88, size: 10, wide: true },
  { kind: 'spark', x: 46, y: 81, size: 11, wide: true },
  { kind: 'spark', x: 61, y: 69, size: 10, wide: true },
  { kind: 'square', x: 62, y: 87, size: 18, wide: true },
  { kind: 'spark', x: 95, y: 9, size: 13, accent: true },
  { kind: 'dot', x: 85, y: 11, size: 4 },
  { kind: 'dot', x: 91, y: 19, size: 4 },
  { kind: 'ring', x: 79, y: 23, size: 18, accent: true, wide: true },
  { kind: 'plus', x: 94, y: 35, size: 12 },
  { kind: 'spark', x: 88, y: 38, size: 13, accent: true },
  { kind: 'spark', x: 77, y: 51, size: 10, wide: true },
  { kind: 'spark', x: 96, y: 53, size: 12, accent: true },
  { kind: 'dot', x: 68, y: 58, size: 4, wide: true },
  { kind: 'dot', x: 82, y: 65, size: 4 },
  { kind: 'dot', x: 75, y: 75, size: 5, accent: true },
  { kind: 'spark', x: 75, y: 91, size: 12, accent: true },
  { kind: 'dot', x: 58, y: 92, size: 4, wide: true },
];

/** The decorative sky behind the Search page: twinkling marks and a line drawing. */
export function SearchBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      {STARS.map((star, index) => (
        <span
          key={index}
          className={`${styles.star} ${star.accent ? styles.accent : ''} ${
            star.wide ? styles.wide : ''
          }`}
          style={
            {
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              // Spread the twinkles so they never pulse together.
              '--delay': `${-((index * 1.37) % 6).toFixed(2)}s`,
              '--duration': `${4 + (index % 5)}s`,
            } as CSSProperties
          }
        >
          <StarShape kind={star.kind} />
        </span>
      ))}
      <LineArt />
    </div>
  );
}

function StarShape({ kind }: { kind: StarKind }) {
  switch (kind) {
    case 'spark':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 0c.9 6.6 4.4 10.4 12 12-7.6 1.6-11.1 5.4-12 12-.9-6.6-4.4-10.4-12-12C7.6 10.4 11.1 6.6 12 0Z" />
        </svg>
      );
    case 'sparkOutline':
      return (
        <svg viewBox="0 0 24 24" className={styles.outline}>
          <path d="M12 1.5c.8 5.6 3.9 9 10.5 10.5-6.6 1.5-9.7 4.9-10.5 10.5-.8-5.6-3.9-9-10.5-10.5C8.1 10.5 11.2 7.1 12 1.5Z" />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" className={styles.outline}>
          <path d="M12 3v18M3 12h18" />
        </svg>
      );
    case 'dot':
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="12" />
        </svg>
      );
    case 'ring':
      return (
        <svg viewBox="0 0 24 24" className={styles.outline}>
          <circle cx="12" cy="12" r="10.5" />
        </svg>
      );
    case 'square':
      return (
        <svg viewBox="0 0 24 24" className={styles.outline}>
          <rect x="2" y="2" width="20" height="20" rx="5" />
        </svg>
      );
  }
}

/** The loose sketch in the bottom-right: a search card, a checklist, and a calendar. */
function LineArt() {
  return (
    <svg className={styles.art} viewBox="0 -10 370 300" fill="none">
      <path className={styles.dash} d="M186 34C212 4 262 -2 292 22" />
      <circle className={styles.artDot} cx="296" cy="26" r="3.5" />
      <path className={styles.dash} d="M36 150c2 44 32 82 88 98" />
      <circle className={styles.artDot} cx="122" cy="226" r="2.5" />
      <circle className={styles.artDot} cx="350" cy="44" r="2" />

      <g className={styles.driftA}>
        <g transform="rotate(-14 105 90)">
          <rect x="12" y="50" width="186" height="82" rx="10" />
          <circle cx="46" cy="91" r="8" />
          <path d="m52 97 7 7" />
          <path className={styles.faint} d="M76 80h90M76 92h104M76 104h70" />
        </g>
      </g>

      <g className={styles.driftB}>
        <g transform="rotate(-20 190 190)">
          <rect x="122" y="118" width="140" height="140" rx="10" />
          <rect x="140" y="146" width="14" height="14" rx="3" />
          <path className={styles.check} d="m143 153 4 4 9-11" />
          <rect x="140" y="178" width="14" height="14" rx="3" />
          <path className={styles.check} d="m143 185 4 4 9-11" />
          <rect x="140" y="210" width="14" height="14" rx="3" />
          <path className={styles.check} d="m143 217 4 4 6-7" />
          <path
            className={styles.faint}
            d="M166 150h72M166 158h52M166 182h72M166 190h40M166 214h60"
          />
        </g>
      </g>

      <g className={styles.driftC}>
        <g transform="rotate(-16 290 96)">
          <rect x="254" y="60" width="72" height="68" rx="8" />
          <path d="M254 78h72M272 52v14M308 52v14" />
          <path className={styles.faint} d="M266 94h24M266 106h40" />
        </g>
      </g>
    </svg>
  );
}
