import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { SearchBackdrop } from './SearchBackdrop';
import { ClearIcon, MagnifierIcon } from './SearchIcons';
import { SearchResults } from './SearchResults';
import styles from './SearchView.module.css';
import { useCalendars } from '../../calendar/hooks/useCalendars';
import { useProfile } from '../../settings/hooks/useSettings';
import { useTaskLists } from '../../tasks/hooks/useTasks';
import { useMeasuredHeight } from '../hooks/useMeasuredHeight';
import { useSearch } from '../hooks/useSearch';
import {
  buildSearchSections,
  resolveSearchStatus,
  type SearchResultItem,
} from '../utils/search-results';

export function SearchView() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q')?.trim() ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [contentRef, contentHeight] = useMeasuredHeight<HTMLDivElement>();
  const navigate = useNavigate();
  const profile = useProfile();
  const calendars = useCalendars();
  const lists = useTaskLists();
  const search = useSearch(debounced);
  const timeZone = profile.data?.timezone ?? 'UTC';
  const hourCycle = profile.data?.hourCycle ?? 'h23';
  const normalized = query.trim();

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebounced(normalized), 220);
    return () => globalThis.clearTimeout(timer);
  }, [normalized]);
  useEffect(() => setActiveIndex(0), [debounced]);
  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    globalThis.addEventListener('keydown', handleGlobalShortcut);
    return () => globalThis.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  const sections = useMemo(
    () =>
      search.data
        ? buildSearchSections(search.data, {
            query: debounced,
            now: new Date(),
            timeZone,
            hourCycle,
            calendars: calendars.data ?? [],
            lists: lists.data ?? [],
          })
        : [],
    [calendars.data, debounced, hourCycle, lists.data, search.data, timeZone],
  );
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  const isSearching = normalized.length >= 2 && (debounced !== normalized || search.isFetching);
  const status = resolveSearchStatus({
    query: normalized,
    isSearching,
    isError: search.isError,
    itemCount: items.length,
  });
  const activeKey = status === 'results' ? items[activeIndex]?.key : undefined;

  // Keep the keyboard selection visible as arrow keys move through a long list.
  useEffect(() => {
    if (activeKey) document.getElementById(activeKey)?.scrollIntoView({ block: 'nearest' });
  }, [activeKey]);

  const openItem = (item: SearchResultItem) => navigate(item.href);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuery('');
      return;
    }
    if (status !== 'results' || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const activeItem = items[activeIndex];
      if (activeItem) openItem(activeItem);
    }
  };

  return (
    <div className={styles.scene}>
      <SearchBackdrop />
      <div className={styles.page}>
        <div className={styles.intro}>
          <h2>Find anything</h2>
          <p>Tasks, events, calendars, and lists across your BPlan workspace.</p>
        </div>

        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>
            <MagnifierIcon />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search your workspace"
            aria-label="Search workspace"
            aria-controls="search-results"
            aria-activedescendant={activeKey}
            autoComplete="off"
            autoFocus
          />
          {query ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <ClearIcon />
            </button>
          ) : (
            <kbd className={styles.shortcut}>Ctrl K</kbd>
          )}
          <span
            className={`${styles.progress} ${isSearching ? styles.progressActive : ''}`}
            aria-hidden="true"
          />
        </div>

        {/* Always mounted: the viewport animates to each new content height. */}
        <div className={styles.panel}>
          <div
            id="search-results"
            className={styles.viewport}
            style={
              contentHeight === null
                ? undefined
                : ({ '--content-height': `${contentHeight}px` } as CSSProperties)
            }
            aria-live="polite"
          >
            <div ref={contentRef}>
              <SearchResults
                status={status}
                query={debounced}
                sections={sections}
                activeKey={activeKey}
                isRefreshing={isSearching}
                onHover={(key) => setActiveIndex(items.findIndex((item) => item.key === key))}
                onOpen={openItem}
                onRetry={() => void search.refetch()}
              />
            </div>
          </div>
          {status === 'results' && (
            <footer className={styles.footer} aria-hidden="true">
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                Navigate
              </span>
              <span>
                <kbd>↵</kbd>
                Open
              </span>
              <span>
                <kbd>Esc</kbd>
                Clear
              </span>
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
