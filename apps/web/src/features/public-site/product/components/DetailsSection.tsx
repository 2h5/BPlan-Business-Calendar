import { ACCENT_PRESETS } from '@cal/domain';
import { useRef, type CSSProperties } from 'react';

import styles from './DetailsSection.module.css';
import { GoogleGlyph } from '../../../../components/brand/BrandGlyphs';
import { useInView } from '../hooks/useScenePlayback';

const SWATCHES = ACCENT_PRESETS.slice(0, 6);

interface DetailsSectionProps {
  accent: string;
  onAccentChange: (color: string) => void;
}

/**
 * The smaller features, laid out as an open row rather than cards: search,
 * accent colours (which recolour this very page), calendar sync, and view
 * shortcuts, each with a small moving illustration.
 */
export function DetailsSection({ accent, onAccentChange }: DetailsSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const { revealed } = useInView(ref, { threshold: 0.2 });

  return (
    <section
      ref={ref}
      className={styles.details}
      data-revealed={revealed}
      aria-labelledby="details-title"
    >
      <div className={styles.intro}>
        <p className={styles.eyebrow}>And the rest</p>
        <h2 id="details-title" className={styles.title}>
          The small things, <em>done well.</em>
        </h2>
      </div>

      <ul className={styles.items}>
        <li style={{ '--i': 0 } as CSSProperties}>
          <div className={styles.art} aria-hidden="true">
            <div className={styles.search}>
              <SearchGlyph />
              <span>
                review
                <i />
              </span>
            </div>
            <div className={styles.results}>
              <span>
                Design <mark>review</mark> <small>Tue · 2:30 PM</small>
              </span>
              <span>
                Roadmap <mark>review</mark> <small>Mon · 11 AM</small>
              </span>
            </div>
          </div>
          <h3>Search everything</h3>
          <p>Find any event or task in a few keystrokes.</p>
        </li>

        <li style={{ '--i': 1 } as CSSProperties}>
          <div className={styles.art}>
            <div className={styles.swatches} role="group" aria-label="Try an accent colour">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  aria-label={swatch.name}
                  aria-pressed={accent === swatch.color}
                  style={{ '--swatch': swatch.color } as CSSProperties}
                  onClick={() => onAccentChange(swatch.color)}
                />
              ))}
            </div>
            <span className={styles.tryIt}>Try one. This page follows.</span>
          </div>
          <h3>Make it yours</h3>
          <p>Pick an accent and light or dark mode. Every screen follows along.</p>
        </li>

        <li style={{ '--i': 2 } as CSSProperties}>
          <div className={`${styles.art} ${styles.sync}`} aria-hidden="true">
            <span className={styles.provider}>
              <GoogleGlyph />
              Google
            </span>
            <span className={styles.wire}>
              <i />
            </span>
            <span className={styles.hub}>B</span>
            <span className={styles.wire} data-reverse="true">
              <i />
            </span>
            <span className={styles.provider}>Apple</span>
          </div>
          <h3>Two-way sync</h3>
          <p>Google and Apple calendars stay in step with BPlan, both directions.</p>
        </li>

        <li style={{ '--i': 3 } as CSSProperties}>
          <div className={`${styles.art} ${styles.keys}`} aria-hidden="true">
            <kbd>D</kbd>
            <kbd>W</kbd>
            <kbd>M</kbd>
          </div>
          <h3>Keyboard first</h3>
          <p>Jump between day, week, and month with a single key you choose.</p>
        </li>
      </ul>
    </section>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="4.3" stroke="currentColor" strokeWidth="1.6" />
      <path d="m10.3 10.3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
