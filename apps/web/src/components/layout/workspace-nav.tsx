import type { WorkspaceTab } from '@cal/schemas';

export interface WorkspaceNavItem {
  tab: WorkspaceTab;
  to: string;
  label: string;
  icon: () => React.JSX.Element;
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function TodayIcon() {
  return (
    <NavIcon>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </NavIcon>
  );
}

function CalendarIcon() {
  return (
    <NavIcon>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </NavIcon>
  );
}

function TasksIcon() {
  return (
    <NavIcon>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </NavIcon>
  );
}

function SearchIcon() {
  return (
    <NavIcon>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </NavIcon>
  );
}

/** The sidebar's Workspace links, in their default order. */
export const WORKSPACE_NAV: Record<WorkspaceTab, WorkspaceNavItem> = {
  today: { tab: 'today', to: '/today', label: 'Today', icon: TodayIcon },
  calendar: { tab: 'calendar', to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  tasks: { tab: 'tasks', to: '/tasks', label: 'Tasks', icon: TasksIcon },
  search: { tab: 'search', to: '/search', label: 'Search', icon: SearchIcon },
};
