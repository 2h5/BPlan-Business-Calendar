import { useRef, type CSSProperties, type ReactNode } from 'react';

import styles from './FeatureStory.module.css';
import { useInView } from '../hooks/useScenePlayback';

export interface SceneState {
  /** Latched true the first time the story scrolls into view. */
  revealed: boolean;
  /** True only while the story is on screen; demos pause when it is not. */
  visible: boolean;
}

interface FeatureStoryProps {
  id: string;
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  points?: readonly string[];
  /** Puts the demo on the left on wide screens. */
  reverse?: boolean;
  children: (scene: SceneState) => ReactNode;
}

/**
 * One chapter of the product page: copy on one side, a live demo on the
 * other, with no frame around either. The copy rises in line by line, then
 * the demo settles in and starts playing.
 */
export function FeatureStory({
  id,
  eyebrow,
  title,
  body,
  points,
  reverse = false,
  children,
}: FeatureStoryProps) {
  const ref = useRef<HTMLElement>(null);
  const scene = useInView(ref);
  const titleId = `${id}-title`;

  return (
    <section
      ref={ref}
      id={id}
      className={`${styles.story} ${reverse ? styles.reverse : ''}`}
      data-revealed={scene.revealed}
      aria-labelledby={titleId}
    >
      <div className={styles.copy}>
        <p className={styles.eyebrow} style={stagger(0)}>
          {eyebrow}
        </p>
        <h2 id={titleId} className={styles.title} style={stagger(1)}>
          {title}
        </h2>
        <p className={styles.body} style={stagger(2)}>
          {body}
        </p>
        {points ? (
          <ul className={styles.points}>
            {points.map((point, index) => (
              <li key={point} style={stagger(3 + index)}>
                <CheckGlyph />
                {point}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className={styles.visual}>{children(scene)}</div>
    </section>
  );
}

const stagger = (index: number) => ({ '--i': index }) as CSSProperties;

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.5 8.4 2.8 2.7 6.2-6.3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
