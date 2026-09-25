import type { CSSProperties } from 'react';

import styles from './TodaySearch.module.css';
import {
  splitHighlight,
  type TodaySearchItem,
  type TodaySearchKind,
  type TodaySearchSection,
} from '../utils/today-search';

export type TodaySearchStatus = 'idle' | 'short' | 'loading' | 'error' | 'empty' | 'results';

type TodaySearchResultsProps = {
  status: TodaySearchStatus;
  query: string;
  sections: TodaySearchSection[];
  activeKey: string | undefined;
  isRefreshing: boolean;
  onHover: (key: string) => void;
  onOpen: (item: TodaySearchItem) => void;
};

const SCOPES: { kind: TodaySearchKind; title: string; body: string }[] = [
  { kind: 'event', title: 'Events', body: 'Titles, notes, places' },
  { kind: 'task', title: 'Tasks', body: 'Titles and notes' },
  { kind: 'calendar', title: 'Calendars', body: 'By name' },
  { kind: 'list', title: 'Lists', body: 'By name' },
];

/** The body of the Today search panel: one view per search status. */
export function TodaySearchResults({
  status,
  query,
  sections,
  activeKey,
  isRefreshing,
  onHover,
  onOpen,
}: TodaySearchResultsProps) {
  if (status === 'idle') {
    return (
      <div key="idle" className={styles.view}>
        <div className={styles.intro}>
          <strong>Search your workspace</strong>
          <span>Jump to any event, task, calendar, or list.</span>
        </div>
        <ul className={styles.scopes} aria-label="What you can search">
          {SCOPES.map((scope) => (
            <li key={scope.kind}>
              <span className={`${styles.kindIcon} ${styles[scope.kind]}`} aria-hidden="true">
                <KindIcon kind={scope.kind} />
              </span>
              <span>
                <strong>{scope.title}</strong>
                <small>{scope.body}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (status === 'short') {
    return (
      <SearchState key="short" title="Keep typing" body="Search starts after two characters." />
    );
  }

  if (status === 'loading') {
    return (
      <div key="loading" className={styles.view} role="status" aria-label="Searching">
        {[0, 1, 2].map((index) => (
          <div key={index} className={styles.skeleton} style={rowIndex(index)}>
            <span />
            <span>
              <i />
              <i />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <SearchState
        key="error"
        title="Search unavailable"
        body="Check your connection and try again."
      />
    );
  }

  if (status === 'empty') {
    return (
      <SearchState
        key="empty"
        title={`No matches for “${query}”`}
        body="Try a word from the title, notes, or location."
      />
    );
  }

  let rowCount = 0;
  return (
    <div
      key="results"
      className={`${styles.view} ${isRefreshing ? styles.refreshing : ''}`}
      role="listbox"
      aria-label="Search results"
      aria-busy={isRefreshing}
    >
      {sections.map((section) => (
        <div key={section.kind} role="group" aria-label={section.title} className={styles.section}>
          <div className={styles.sectionHeader} aria-hidden="true">
            <span>{section.title}</span>
            <span>
              {section.total > section.items.length
                ? `${section.items.length} of ${section.total >= 40 ? '40+' : section.total}`
                : section.total}
            </span>
          </div>
          {section.items.map((item) => {
            const index = rowCount++;
            return (
              <ResultRow
                key={item.key}
                item={item}
                query={query}
                index={index}
                isActive={item.key === activeKey}
                onHover={onHover}
                onOpen={onOpen}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ResultRow({
  item,
  query,
  index,
  isActive,
  onHover,
  onOpen,
}: {
  item: TodaySearchItem;
  query: string;
  index: number;
  isActive: boolean;
  onHover: (key: string) => void;
  onOpen: (item: TodaySearchItem) => void;
}) {
  const style = {
    ...rowIndex(index),
    ...(item.color ? { '--item-color': item.color } : {}),
  } as CSSProperties;

  return (
    <button
      id={item.key}
      type="button"
      role="option"
      aria-selected={isActive}
      className={`${styles.result} ${isActive ? styles.resultActive : ''} ${item.isMuted ? styles.resultMuted : ''}`}
      style={style}
      onMouseEnter={() => onHover(item.key)}
      onClick={() => onOpen(item)}
    >
      <span
        className={`${styles.kindIcon} ${styles[item.kind]} ${item.color ? styles.tinted : ''}`}
        aria-hidden="true"
      >
        <KindIcon kind={item.kind} />
      </span>

      <span className={styles.resultBody}>
        <span className={styles.resultTitleRow}>
          <strong className={item.kind === 'task' && item.isMuted ? styles.done : undefined}>
            <Highlighted text={item.title} query={query} />
          </strong>
          {item.badges.map((badge) => (
            <span key={badge.label} className={`${styles.badge} ${styles[`tone_${badge.tone}`]}`}>
              {badge.label}
            </span>
          ))}
        </span>
        <span className={styles.resultMeta}>
          <span className={styles[`text_${item.primaryTone}`]}>{item.primary}</span>
          {item.details.map((detail) => (
            <span key={detail} className={styles.detail}>
              {detail}
            </span>
          ))}
        </span>
        {item.snippet && (
          <span className={styles.snippet}>
            <Highlighted text={item.snippet} query={query} />
          </span>
        )}
      </span>

      <ArrowIcon />
    </button>
  );
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitHighlight(text, query).map((segment, index) =>
        segment.isMatch ? <mark key={index}>{segment.text}</mark> : segment.text,
      )}
    </>
  );
}

function SearchState({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${styles.view} ${styles.state}`} role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function rowIndex(index: number): CSSProperties {
  return { '--row-index': index } as CSSProperties;
}

function KindIcon({ kind }: { kind: TodaySearchKind }) {
  if (kind === 'task') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="m8.5 12 2.4 2.4 4.6-4.9"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === 'list') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 6.5h10M9 12h10M9 17.5h10"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="5" cy="6.5" r="1.1" fill="currentColor" />
        <circle cx="5" cy="12" r="1.1" fill="currentColor" />
        <circle cx="5" cy="17.5" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  if (kind === 'calendar') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <rect
          x="4"
          y="5.5"
          width="16"
          height="14"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path d="M8 3.5v4M16 3.5v4M4 10h16" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 14h3M13 14h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className={styles.arrow}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 17 17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
