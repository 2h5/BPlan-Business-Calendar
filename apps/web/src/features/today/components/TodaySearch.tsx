import { describeTaskDue, formatTimeOfDay, toZonedDateKey } from '@cal/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './TodaySearch.module.css';
import { useSearch } from '../../search/hooks/useSearch';
import { useProfile } from '../../settings/hooks/useSettings';

type SearchItem = {
  key: string;
  title: string;
  meta: string;
  kind: 'event' | 'task' | 'calendar' | 'list';
  open: () => void;
};

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
  const navigate = useNavigate();
  const profile = useProfile();
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

  const items = useMemo<SearchItem[]>(() => {
    const data = search.data;
    if (!data) return [];

    return [
      ...data.events.slice(0, 4).map((event) => ({
        key: `event:${event.id}`,
        title: event.title,
        meta: `${event.allDay ? 'All day' : formatTimeOfDay(new Date(event.startAt), timeZone, hourCycle)} · ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(event.startAt))}`,
        kind: 'event' as const,
        open: () =>
          navigate(
            `/calendar?date=${toZonedDateKey(new Date(event.startAt), timeZone)}&event=${event.id}`,
          ),
      })),
      ...data.tasks.slice(0, 4).map((task) => ({
        key: `task:${task.id}`,
        title: task.title,
        meta:
          task.status === 'completed'
            ? 'Completed task'
            : describeTaskDue(task, { now: new Date(), timeZone, hourCycle }).text || 'Task',
        kind: 'task' as const,
        open: () => navigate(`/tasks?task=${task.id}`),
      })),
      ...data.calendars.slice(0, 2).map((calendar) => ({
        key: `calendar:${calendar.id}`,
        title: calendar.name,
        meta: 'Calendar',
        kind: 'calendar' as const,
        open: () => navigate('/calendar'),
      })),
      ...data.lists.slice(0, 2).map((list) => ({
        key: `list:${list.id}`,
        title: list.name,
        meta: 'Task list',
        kind: 'list' as const,
        open: () => navigate(`/tasks?list=${list.id}`),
      })),
    ];
  }, [hourCycle, navigate, search.data, timeZone]);

  const openItem = (item: SearchItem) => {
    closeSearch(false);
    item.open();
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
      else if (normalizedQuery.length >= 2)
        navigate(`/search?q=${encodeURIComponent(normalizedQuery)}`);
    }
  };

  const showResults = normalizedQuery.length >= 2;
  const isSearching =
    showResults && (debouncedQuery !== normalizedQuery || search.isLoading || search.isFetching);

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
            aria-activedescendant={items[activeIndex]?.key}
            autoComplete="off"
            tabIndex={isOpen ? 0 : -1}
          />
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
      </div>

      <div
        id="today-search-panel"
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}
        aria-hidden={!isOpen}
        inert={isOpen ? undefined : true}
      >
        <div id="today-search-results" className={styles.results} aria-live="polite">
          {!normalizedQuery && (
            <SearchState title="Find anything" body="Start typing to search your workspace." />
          )}
          {normalizedQuery.length === 1 && (
            <SearchState title="Keep typing" body="Enter one more character to search." />
          )}
          {isSearching && <SearchState title="Searching…" body="Looking across your workspace." />}
          {showResults && !isSearching && search.isError && (
            <SearchState title="Search unavailable" body="Check your connection and try again." />
          )}
          {showResults && !isSearching && !search.isError && items.length === 0 && (
            <SearchState title="No matches" body={`Nothing matched “${normalizedQuery}”.`} />
          )}
          {showResults && !isSearching && !search.isError && items.length > 0 && (
            <div role="listbox" aria-label="Search results">
              {items.map((item, index) => (
                <button
                  id={item.key}
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`${styles.result} ${index === activeIndex ? styles.resultActive : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openItem(item)}
                >
                  <span className={`${styles.resultIcon} ${styles[item.kind]}`} aria-hidden="true">
                    {item.kind === 'event' || item.kind === 'calendar' ? (
                      <CalendarResultIcon />
                    ) : (
                      <TaskResultIcon />
                    )}
                  </span>
                  <span className={styles.resultText}>
                    <strong>{item.title}</strong>
                    <small>{item.meta}</small>
                  </span>
                  <ArrowIcon />
                </button>
              ))}
            </div>
          )}
        </div>

        {showResults && (
          <button
            type="button"
            className={styles.viewAll}
            onClick={() => navigate(`/search?q=${encodeURIComponent(normalizedQuery)}`)}
          >
            View all results
            <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
    </div>
  );
}

function SearchState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.state} role="status">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
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

function CalendarResultIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function TaskResultIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m8 12 2.5 2.5L16 9"
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
