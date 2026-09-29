import { useEffect, useRef, useState, type CSSProperties } from 'react';

import styles from './SearchScene.module.css';
import { DEMO_COLORS, DEMO_DAYS, DEMO_EVENTS, formatDemoTime } from '../demo-data';
import { usePrefersReducedMotion } from '../hooks/useScenePlayback';

interface SearchItem {
  id: string;
  title: string;
  meta: string;
  /** An event's calendar colour; tasks show a checkbox instead. */
  color?: string;
}

/** The demo week's events (each title once) plus a few tasks. */
const ITEMS: readonly SearchItem[] = [
  ...DEMO_EVENTS.filter(
    (event, index) => DEMO_EVENTS.findIndex((other) => other.title === event.title) === index,
  ).map((event) => ({
    id: event.id,
    title: event.title,
    meta: `${DEMO_DAYS[event.day]} · ${formatDemoTime(event.start)}`,
    color: DEMO_COLORS[event.color],
  })),
  { id: 'task-budget', title: 'Review Q4 budget', meta: 'Task · Today' },
  { id: 'task-rubric', title: 'Draft hiring rubric', meta: 'Task · Tomorrow' },
  { id: 'task-notes', title: 'Send launch notes', meta: 'Task · Today' },
];

const QUERIES = ['design', 'hiring', 'sprint', 'lunch'] as const;
const MAX_RESULTS = 2;
const TYPE_MS = [120, 95, 140, 85, 110, 100];
const DELETE_MS = 45;
const HOLD_MS = 1900;
const EMPTY_MS = 450;

/** Word-start matches first, then the order the week lists them. */
function search(query: string): SearchItem[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const score = (title: string) => {
    const at = title.toLowerCase().indexOf(needle);
    if (at < 0) return -1;
    return at === 0 || title[at - 1] === ' ' ? 0 : 1;
  };
  return ITEMS.filter((item) => score(item.title) >= 0)
    .sort((left, right) => score(left.title) - score(right.title))
    .slice(0, MAX_RESULTS);
}

type Phase = 'typing' | 'holding' | 'deleting' | 'empty';

/**
 * Types a few searches in turn. Results are filtered on every keystroke, so
 * rows slide in, out, and reorder as the query grows and shrinks.
 */
export function SearchScene({ playing }: { playing: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState({ query: 0, typed: 0, phase: 'empty' as Phase });

  useEffect(() => {
    if (!playing || reducedMotion) return undefined;
    const word = QUERIES[state.query] ?? '';
    let hold: number;
    let next: typeof state;
    switch (state.phase) {
      case 'empty':
        hold = EMPTY_MS;
        next = { ...state, phase: 'typing' };
        break;
      case 'typing':
        hold = TYPE_MS[state.typed % TYPE_MS.length] ?? 110;
        next =
          state.typed + 1 >= word.length
            ? { ...state, typed: word.length, phase: 'holding' }
            : { ...state, typed: state.typed + 1 };
        break;
      case 'holding':
        hold = HOLD_MS;
        next = { ...state, phase: 'deleting' };
        break;
      case 'deleting':
        hold = DELETE_MS;
        next =
          state.typed <= 1
            ? { query: (state.query + 1) % QUERIES.length, typed: 0, phase: 'empty' }
            : { ...state, typed: state.typed - 1 };
        break;
    }
    const timer = window.setTimeout(() => setState(next), hold);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, state]);

  const query = reducedMotion ? QUERIES[0] : (QUERIES[state.query] ?? '').slice(0, state.typed);
  const results = search(query);

  // A row that drops out keeps its last slot, so it fades where it was.
  const lastRow = useRef(new Map<string, number>());
  results.forEach((item, row) => lastRow.current.set(item.id, row));

  return (
    <div className={styles.scene}>
      <div className={styles.field} data-active={query.length > 0}>
        <SearchGlyph />
        <span className={styles.query}>
          {query}
          <i className={styles.caret} data-typing={state.phase !== 'holding'} />
          {query ? null : <span className={styles.placeholder}>Search events and tasks</span>}
        </span>
        <span className={styles.count} data-shown={results.length > 0} key={results.length}>
          {results.length}
        </span>
      </div>

      <div className={styles.results}>
        {ITEMS.map((item) => {
          const shown = results.includes(item);
          return (
            <span
              key={item.id}
              className={styles.row}
              data-shown={shown}
              style={{ '--row': lastRow.current.get(item.id) ?? 0 } as CSSProperties}
            >
              {item.color ? (
                <i className={styles.dot} style={{ background: item.color }} />
              ) : (
                <i className={styles.check} />
              )}
              <span className={styles.title}>
                {shown ? <Highlight text={item.title} query={query} /> : item.title}
              </span>
              <small>{item.meta}</small>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0 || !query) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
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
