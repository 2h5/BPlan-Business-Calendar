import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import styles from './AppShell.module.css';
import { PageTransition } from './PageTransition';
import { signOut, useAuth } from '../../features/auth';

interface NavItemConfig {
  to: string;
  label: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}

function TodayIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function CalendarIcon() {
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function TasksIcon() {
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
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function SearchIcon() {
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SettingsIcon() {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SubscriptionIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      fillOpacity="0.2"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const PRIMARY_NAV: NavItemConfig[] = [
  { to: '/today', label: 'Today', icon: TodayIcon },
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/tasks', label: 'Tasks', icon: TasksIcon },
  { to: '/search', label: 'Search', icon: SearchIcon },
];

const WORKSPACE_PATHS = ['/today', '/calendar', '/tasks', '/search'];

function isWorkspacePath(pathname: string): boolean {
  return WORKSPACE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function AppShell() {
  const { email } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const prevPathRef = useRef<string>(location.pathname);
  const isInitialMount = useRef(true);
  const [metrics, setMetrics] = useState<{ top: number; height: number } | null>(null);
  const [mode, setMode] = useState<'sliding' | 'entering' | 'exiting' | 'hidden'>('hidden');

  useLayoutEffect(() => {
    const prevPath = prevPathRef.current;
    const currentPath = location.pathname;
    prevPathRef.current = currentPath;

    const wasWorkspace = isWorkspacePath(prevPath);
    const isWorkspace = isWorkspacePath(currentPath);

    if (isWorkspace) {
      const activeIndex = PRIMARY_NAV.findIndex(
        (item) => item.to === currentPath || currentPath.startsWith(`${item.to}/`),
      );
      const el = itemRefs.current[activeIndex];
      if (el) {
        setMetrics({
          top: el.offsetTop,
          height: el.offsetHeight,
        });
      }

      if (isInitialMount.current) {
        isInitialMount.current = false;
        setMode('sliding');
      } else if (wasWorkspace) {
        setMode('sliding');
      } else {
        setMode('entering');
      }
    } else {
      isInitialMount.current = false;
      if (wasWorkspace) {
        setMode('exiting');
      } else {
        setMode('hidden');
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    function handleResize() {
      if (!isWorkspacePath(location.pathname)) return;
      const activeIndex = PRIMARY_NAV.findIndex(
        (item) => item.to === location.pathname || location.pathname.startsWith(`${item.to}/`),
      );
      const el = itemRefs.current[activeIndex];
      if (el) {
        setMetrics({
          top: el.offsetTop,
          height: el.offsetHeight,
        });
      }
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [location.pathname]);

  async function handleSignOut() {
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      // Sign out locally regardless of network response
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar Navigation */}
      <aside className={styles.sidebar} aria-label="Sidebar Navigation">
        <div className={styles.brand}>
          <div className={styles.brandLogo} aria-hidden="true">
            B
          </div>
          <div className={styles.brandCopy}>
            <span className={styles.brandName}>BPlan</span>
            <span className={styles.brandTag}>Plan with clarity</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Main navigation">
          <div className={styles.navGroup}>
            <span className={styles.navGroupLabel}>Workspace</span>
            <div className={styles.workspaceList}>
              {metrics && mode !== 'hidden' && (
                <div
                  className={`${styles.workspaceHighlight} ${
                    mode === 'sliding'
                      ? styles.modeSliding
                      : mode === 'entering'
                        ? styles.modeEntering
                        : mode === 'exiting'
                          ? styles.modeExiting
                          : ''
                  }`}
                  style={
                    {
                      '--target-top': `${metrics.top}px`,
                      transform: `translateY(${metrics.top}px)`,
                      height: `${metrics.height}px`,
                    } as React.CSSProperties
                  }
                  onAnimationEnd={() => {
                    if (mode === 'entering') {
                      setMode('sliding');
                    }
                  }}
                  onTransitionEnd={() => {
                    if (mode === 'exiting') {
                      setMode('hidden');
                    }
                  }}
                  aria-hidden="true"
                />
              )}
              {PRIMARY_NAV.map((item, index) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  className={({ isActive }) =>
                    `${styles.navItem} ${styles.workspaceNavItem} ${
                      isActive ? styles.workspaceNavItemActive : ''
                    }`
                  }
                >
                  <span className={styles.navIcon}>
                    <item.icon />
                  </span>
                  <span className={styles.navLabel}>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>

          <div className={styles.navSpacer} />

          <div className={styles.navGroup}>
            <NavLink
              to="/subscription"
              className={({ isActive }) =>
                `${styles.navItem} ${styles.navItemHighlight} ${
                  isActive ? styles.navItemActive : ''
                }`
              }
            >
              <span className={`${styles.navIcon} ${styles.navIconHighlight}`}>
                <SubscriptionIcon />
              </span>
              <span className={styles.navLabel}>Plan &amp; Pro</span>
              <span className={styles.navBadge}>PRO</span>
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navIcon}>
                <SettingsIcon />
              </span>
              <span className={styles.navLabel}>Settings</span>
            </NavLink>
          </div>
        </nav>

        <div className={styles.sidebarFooter}>
          {email && (
            <div className={styles.userCard} title={email}>
              <span className={styles.userAvatar} aria-hidden="true">
                {email.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.userMeta}>
                <span className={styles.userLabel}>Signed in</span>
                <span className={styles.userEmail}>{email}</span>
              </span>
            </div>
          )}
          <button
            type="button"
            className={styles.signOutButton}
            onClick={handleSignOut}
            aria-label="Sign out of BPlan"
          >
            <SignOutIcon />
            <span className={styles.signOutText}>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainContent}>
        <main
          className={
            location.pathname === '/tasks' || location.pathname === '/calendar'
              ? styles.contentAreaFull
              : styles.contentArea
          }
        >
          <PageTransition contentKey={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
