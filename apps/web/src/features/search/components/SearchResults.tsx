import type { CSSProperties } from 'react';

import { ResultKindIcon } from './SearchIcons';
import { SearchIllustration } from './SearchIllustration';
import styles from './SearchView.module.css';
import {
  splitHighlight,
  type SearchResultItem,
  type SearchResultSection,
  type SearchStatus,
} from '../utils/search-results';

type SearchResultsProps = {
  status: SearchStatus;
  query: string;
  sections: SearchResultSection[];
  activeKey: string | undefined;
  isRefreshing: boolean;
  onHover: (key: string) => void;
  onOpen: (item: SearchResultItem) => void;
  onRetry: () => void;
};

/** The body of the Search page panel: one view per search status. */
export function SearchResults({
  status,
  query,
  sections,
  activeKey,
  isRefreshing,
  onHover,
  onOpen,
  onRetry,
}: SearchResultsProps) {
  if (status === 'idle') {
    return (
      <div key="idle" className={`${styles.view} ${styles.idle}`} role="status">
        <SearchIllustration />
        <strong>Start typing to search</strong>
        <span>Search by title, notes, or location.</span>
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
        {[0, 1, 2, 3].map((index) => (
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
        title="Search could not load"
        body="Check your connection and try again."
        onRetry={onRetry}
      />
    );
  }

  if (status === 'empty') {
    return (
      <SearchState
        key="empty"
        title={`No matches for “${query}”`}
        body="Try a word from the title, notes, location, calendar, or list."
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
        <div key={section.kind} role="group" aria-label={section.title} className={styles.group}>
          <div className={styles.groupHeader} aria-hidden="true">
            <span>{section.title}</span>
            <span>{section.total >= 40 ? '40+' : section.total}</span>
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
  item: SearchResultItem;
  query: string;
  index: number;
  isActive: boolean;
  onHover: (key: string) => void;
  onOpen: (item: SearchResultItem) => void;
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
      className={`${styles.row} ${isActive ? styles.active : ''} ${item.isMuted ? styles.muted : ''}`}
      style={style}
      // Mouse move rather than enter, so rows scrolling under a still cursor
      // do not steal the keyboard selection.
      onMouseMove={() => {
        if (!isActive) onHover(item.key);
      }}
      onClick={() => onOpen(item)}
    >
      <span
        className={`${styles.icon} ${styles[item.kind]} ${item.color ? styles.tinted : ''}`}
        aria-hidden="true"
      >
        <ResultKindIcon kind={item.kind} />
      </span>

      <span className={styles.body}>
        <span className={styles.titleRow}>
          <strong className={item.kind === 'task' && item.isMuted ? styles.done : undefined}>
            <Highlighted text={item.title} query={query} />
          </strong>
          {item.badges.map((badge) => (
            <span key={badge.label} className={`${styles.badge} ${styles[`tone_${badge.tone}`]}`}>
              {badge.label}
            </span>
          ))}
        </span>
        <span className={styles.meta}>
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

      <kbd className={styles.enter} aria-hidden="true">
        ↵
      </kbd>
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

function SearchState({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${styles.view} ${styles.state}`} role={onRetry ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <span>{body}</span>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function rowIndex(index: number): CSSProperties {
  return { '--row-index': index } as CSSProperties;
}
