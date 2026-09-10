import { describeTaskDue, formatTimeOfDay, toZonedDateKey } from '@cal/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import styles from './SearchView.module.css';
import { useProfile } from '../../settings/hooks/useSettings';
import { useSearch } from '../hooks/useSearch';

type ResultItem = {
  key: string;
  label: string;
  meta: string;
  kind: 'event' | 'task' | 'calendar' | 'list';
  open: () => void;
};

export function SearchView() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const profile = useProfile();
  const search = useSearch(debounced);
  const timeZone = profile.data?.timezone ?? 'UTC';
  const hourCycle = profile.data?.hourCycle ?? 'h23';

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setDebounced(query.trim()), 260);
    return () => globalThis.clearTimeout(timer);
  }, [query]);
  useEffect(() => setActiveIndex(0), [debounced]);
  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    globalThis.addEventListener('keydown', handleGlobalShortcut);
    function handleGlobalShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focus();
      }
    }
    return () => globalThis.removeEventListener('keydown', handleGlobalShortcut);
  }, []);

  const groups = useMemo(() => {
    const data = search.data;
    if (!data) return [] as { title: string; items: ResultItem[] }[];
    return [
      {
        title: 'Events',
        items: data.events.map((event) => ({
          key: `event:${event.id}`,
          label: event.title,
          meta: `${event.allDay ? 'All day' : formatTimeOfDay(new Date(event.startAt), timeZone, hourCycle)} · ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(event.startAt))}`,
          kind: 'event' as const,
          open: () =>
            navigate(
              `/calendar?date=${toZonedDateKey(new Date(event.startAt), timeZone)}&event=${event.id}`,
            ),
        })),
      },
      {
        title: 'Tasks',
        items: data.tasks.map((task) => ({
          key: `task:${task.id}`,
          label: task.title,
          meta:
            task.status === 'completed'
              ? 'Completed'
              : describeTaskDue(task, { now: new Date(), timeZone, hourCycle }).text ||
                'No due date',
          kind: 'task' as const,
          open: () => navigate(`/tasks?task=${task.id}`),
        })),
      },
      {
        title: 'Calendars',
        items: data.calendars.map((calendar) => ({
          key: `calendar:${calendar.id}`,
          label: calendar.name,
          meta:
            calendar.sourceType === 'internal'
              ? 'BPlan calendar'
              : `${calendar.sourceType} calendar`,
          kind: 'calendar' as const,
          open: () => navigate('/calendar'),
        })),
      },
      {
        title: 'Lists',
        items: data.lists.map((list) => ({
          key: `list:${list.id}`,
          label: list.name,
          meta: 'Task list',
          kind: 'list' as const,
          open: () => navigate(`/tasks?list=${list.id}`),
        })),
      },
    ].filter((group) => group.items.length > 0);
  }, [hourCycle, navigate, search.data, timeZone]);
  const items = groups.flatMap((group) => group.items);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[activeIndex]?.open();
    } else if (event.key === 'Escape') setQuery('');
  };

  let state: React.ReactNode = null;
  const normalized = query.trim();
  if (!normalized)
    state = (
      <SearchState
        title="Search your workspace"
        body="Find tasks, events, calendars, and lists by the words you remember."
      />
    );
  else if (normalized.length < 2)
    state = <SearchState title="Keep typing" body="Search starts after two characters." />;
  else if (debounced !== normalized || search.isLoading || search.isFetching)
    state = <SearchState title="Searching" body="Looking across your workspace…" />;
  else if (search.isError)
    state = (
      <SearchState
        title="Search could not load"
        body="Check your connection and try again."
        action={() => void search.refetch()}
      />
    );
  else if (!items.length)
    state = (
      <SearchState
        title="No matches"
        body={`Nothing matched “${normalized}”. Try a title, note, location, calendar, or list.`}
      />
    );

  let offset = 0;
  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <h2>Find anything</h2>
        <p>Fast, bounded search across your BPlan workspace.</p>
      </div>
      <div className={styles.searchBox}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tasks, events, calendars, and lists"
          aria-label="Search workspace"
          aria-controls="search-results"
          autoFocus
        />
        <kbd>Ctrl K</kbd>
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
            ×
          </button>
        )}
      </div>
      <div id="search-results" className={styles.results} aria-live="polite">
        {state ??
          groups.map((group) => {
            const start = offset;
            offset += group.items.length;
            return (
              <section key={group.title}>
                <header>
                  <h3>{group.title}</h3>
                  <span>{group.items.length}</span>
                </header>
                <div>
                  {group.items.map((item, index) => {
                    const globalIndex = start + index;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={globalIndex === activeIndex ? styles.active : ''}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                        onClick={item.open}
                      >
                        <span className={`${styles.icon} ${styles[item.kind]}`}>
                          {item.kind.slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.meta}</small>
                        </span>
                        <span className={styles.arrow}>↗</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}

function SearchState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: () => void;
}) {
  return (
    <div className={styles.state} role={action ? 'alert' : 'status'}>
      <strong>{title}</strong>
      <span>{body}</span>
      {action && (
        <button type="button" onClick={action}>
          Try again
        </button>
      )}
    </div>
  );
}
