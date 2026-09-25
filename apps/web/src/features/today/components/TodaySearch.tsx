import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './TodaySearch.module.css';
import { TodaySearchResults, type TodaySearchStatus } from './TodaySearchResults';
import { useCalendars } from '../../calendar/hooks/useCalendars';
import { useSearch } from '../../search/hooks/useSearch';
import { useProfile } from '../../settings/hooks/useSettings';
import { useTaskLists } from '../../tasks/hooks/useTasks';
import { useMeasuredHeight } from '../hooks/useMeasuredHeight';
import { buildTodaySearchSections, type TodaySearchItem } from '../utils/today-search';

type TodaySearchProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export function TodaySearch({ isOpen, onOpenChange }: TodaySearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const clearTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [contentRef, contentHeight] = useMeasuredHeight<HTMLDivElement>();
  const navigate = useNavigate();
  const profile = useProfile();
  const calendars = useCalendars();
  const lists = useTaskLists();
  const search = useSearch(debouncedQuery);
  const timeZone = profile.data?.timezone ?? 'UTC';
  const hourCycle = profile.data?.hourCycle ?? 'h23';
  const normalizedQuery = query.trim();

  const closeSearch = (restoreFocus = true) => {
    onOpenChange(false);
    if (clearTimerRef.current) globalThis.clearTimeout(clearTimerRef.current);
    clearTimerRef.current = globalThis.setTimeout(() => {
      setQuery('');
      setDebouncedQuery('');
      setActiveIndex(0);
      clearTimerRef.current = null;
    }, 240);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openSearch = () => {
    if (clearTimerRef.current) {
      globalThis.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    onOpenChange(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebouncedQuery(normalizedQuery), 220);
    return () => globalThis.clearTimeout(timer);
  }, [normalizedQuery]);

  useEffect(() => setActiveIndex(0), [debouncedQuery]);

  useEffect(
    () => () => {
      if (clearTimerRef.current) globalThis.clearTimeout(clearTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      } else if (event.key === 'Escape' && isOpen) {
        closeSearch();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  });

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeSearch(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  });

  const sections = useMemo(
    () =>
      search.data
        ? buildTodaySearchSections(search.data, {
            query: debouncedQuery,
            now: new Date(),
            timeZone,
            hourCycle,
            calendars: calendars.data ?? [],
            lists: lists.data ?? [],
          })
        : [],
    [calendars.data, debouncedQuery, hourCycle, lists.data, search.data, timeZone],
  );
  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  const openItem = (item: TodaySearchItem) => {
    closeSearch(false);
    navigate(item.href);
  };

  const openFullSearch = () => {
    closeSearch(false);
    navigate(`/search?q=${encodeURIComponent(normalizedQuery)}`);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && items.length) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp' && items.length) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const activeItem = items[activeIndex];
      if (activeItem) openItem(activeItem);
      else if (normalizedQuery.length >= 2) openFullSearch();
    }
  };

  const showResults = normalizedQuery.length >= 2;
  const isSearching = showResults && (debouncedQuery !== normalizedQuery || search.isFetching);
  const status = resolveStatus({
    query: normalizedQuery,
    isSearching,
    isError: search.isError,
    itemCount: items.length,
  });
  const activeKey = status === 'results' ? items[activeIndex]?.key : undefined;
  const totalMatches = sections.reduce((sum, section) => sum + section.total, 0);

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={`${styles.surface} ${isOpen ? styles.surfaceOpen : ''}`}>
        <button
          ref={triggerRef}
          type="button"
          className={`${styles.trigger} ${isOpen ? styles.triggerHidden : ''}`}
          onClick={openSearch}
          title="Search (Ctrl K)"
          aria-label="Search"
          aria-expanded={isOpen}
          aria-controls="today-search-panel"
          tabIndex={isOpen ? -1 : 0}
        >
          <SearchIcon />
        </button>

        <form
          className={`${styles.form} ${isOpen ? styles.formVisible : ''}`}
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <span className={styles.searchIcon} aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search events, tasks, calendars…"
            aria-label="Search your workspace"
            aria-controls="today-search-results"
            aria-activedescendant={activeKey}
            autoComplete="off"
            tabIndex={isOpen ? 0 : -1}
          />
          {query && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              tabIndex={isOpen ? 0 : -1}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className={styles.close}
            onClick={() => closeSearch()}
            title="Close search (Esc)"
            aria-label="Close search"
            tabIndex={isOpen ? 0 : -1}
          >
            <CloseIcon />
          </button>
        </form>
        <span
          className={`${styles.progress} ${isOpen && isSearching ? styles.progressActive : ''}`}
          aria-hidden="true"
        />
      </div>

      <div
        id="today-search-panel"
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}
        aria-hidden={!isOpen}
        inert={isOpen ? undefined : true}
      >
        <div
          id="today-search-results"
          className={styles.results}
          style={
            contentHeight === null
              ? undefined
              : ({ '--content-height': `${contentHeight}px` } as CSSProperties)
          }
          aria-live="polite"
        >
          <div ref={contentRef}>
            <TodaySearchResults
              status={status}
              query={debouncedQuery}
              sections={sections}
              activeKey={activeKey}
              isRefreshing={isSearching}
              onHover={(key) => setActiveIndex(items.findIndex((item) => item.key === key))}
              onOpen={openItem}
            />
          </div>
        </div>

        {showResults && (
          <div className={styles.footer}>
            <button type="button" className={styles.viewAll} onClick={openFullSearch}>
              {status === 'results'
                ? `View all ${totalMatches >= 40 ? '40+' : totalMatches}`
                : 'Full search'}
              <span aria-hidden="true">↗</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function resolveStatus({
  query,
  isSearching,
  isError,
  itemCount,
}: {
  query: string;
  isSearching: boolean;
  isError: boolean;
  itemCount: number;
}): TodaySearchStatus {
  if (!query) return 'idle';
  if (query.length < 2) return 'short';
  // Keep earlier results on screen while the next query loads; only show the
  // skeleton when there is nothing useful to show yet.
  if (isSearching) return itemCount > 0 ? 'results' : 'loading';
  if (isError) return 'error';
  return itemCount > 0 ? 'results' : 'empty';
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
