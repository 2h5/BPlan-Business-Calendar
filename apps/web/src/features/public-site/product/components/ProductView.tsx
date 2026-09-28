import { buildAccentPalette } from '@cal/domain';
import { DEFAULT_ACCENT_COLOR } from '@cal/schemas';
import { useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { DetailsSection } from './DetailsSection';
import { FeatureStory } from './FeatureStory';
import { ProductHero } from './ProductHero';
import styles from './ProductView.module.css';
import { useInView } from '../hooks/useScenePlayback';
import { ConflictScene } from '../scenes/ConflictScene';
import { FindTimeScene } from '../scenes/FindTimeScene';
import { TasksScene } from '../scenes/TasksScene';
import { TodayScene } from '../scenes/TodayScene';
import { ViewsScene } from '../scenes/ViewsScene';

/**
 * The product page: a hero, five feature stories told with live demos, the
 * smaller details, and a closing call to action. The accent picked in the
 * details section recolours the whole page, the way it does in the app.
 */
export function ProductView() {
  const [accent, setAccent] = useState<string>(DEFAULT_ACCENT_COLOR);
  const accentStyle = {
    '--accent': buildAccentPalette(accent).light.accent,
  } as CSSProperties;

  return (
    <main className={styles.product} style={accentStyle}>
      <ProductHero />

      <FeatureStory
        id="today"
        eyebrow="Today"
        title={
          <>
            Know what&rsquo;s next <em>before you ask.</em>
          </>
        }
        body="Today opens on the answer to the only question that matters in the moment: are you free? What's on now or next, how much time is left, and the shape of the whole day at a glance."
        points={[
          'Free or busy, at a glance',
          'Free time left, always counted',
          'Up next, one tap away',
        ]}
      >
        {({ visible }) => <TodayScene playing={visible} />}
      </FeatureStory>

      <FeatureStory
        id="views"
        eyebrow="Calendar"
        title={
          <>
            Day, week, month. <em>One motion.</em>
          </>
        }
        body="Switch views and every event moves with you, so you never lose your place. Your Google and Apple calendars sit side by side in the same view."
        reverse
      >
        {({ visible, revealed }) => <ViewsScene playing={visible} revealed={revealed} />}
      </FeatureStory>

      <FeatureStory
        id="conflicts"
        eyebrow="Conflict detection"
        title={
          <>
            Double-booked? <em>Not on our watch.</em>
          </>
        }
        body="The moment an event touches another, BPlan tells you what it overlaps. The check is exact, rule-based code, not a guess, so a clear calendar really is clear."
        points={['Checked on every move', 'Names exactly what overlaps', 'Same answer every time']}
      >
        {({ visible }) => <ConflictScene playing={visible} />}
      </FeatureStory>

      <FeatureStory
        id="find-time"
        eyebrow="Find Time with AI"
        title={
          <>
            Ask for time. <em>Get real slots.</em>
          </>
        }
        body="Type what you need the way you'd say it. BPlan reads the length and timing, finds every opening that's genuinely free, and lays out the best few. One click books it."
        reverse
      >
        {({ visible }) => <FindTimeScene playing={visible} />}
      </FeatureStory>

      <FeatureStory
        id="tasks"
        eyebrow="Tasks"
        title={
          <>
            Tasks that live <em>next to your time.</em>
          </>
        }
        body="Lists, priorities, due dates, and time estimates, right beside the calendar they compete with. Tick things off and watch the day open up."
        points={[
          'Priorities from low to urgent',
          'Lists with their own colours',
          'Time estimates for planning',
        ]}
      >
        {({ visible }) => <TasksScene playing={visible} />}
      </FeatureStory>

      <DetailsSection accent={accent} onAccentChange={setAccent} />

      <ClosingCall />
    </main>
  );
}

function ClosingCall() {
  const ref = useRef<HTMLElement>(null);
  const { revealed } = useInView(ref, { threshold: 0.35 });

  return (
    <section
      ref={ref}
      className={styles.closing}
      data-revealed={revealed}
      aria-labelledby="closing-title"
    >
      <h2 id="closing-title" className={styles.closingTitle}>
        Plan the day
        <br />
        <em>you actually have.</em>
      </h2>
      <p className={styles.closingBody}>Free to start. Upgrade whenever you're ready.</p>
      <div className={styles.closingActions}>
        <Link className={styles.primary} to="/login">
          Get started free
        </Link>
        <Link className={styles.secondary} to="/pricing">
          Compare plans
        </Link>
      </div>
    </section>
  );
}
