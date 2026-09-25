import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import styles from './AppShell.module.css';
import { PageTransition } from './PageTransition';
import { signOut, useAuth } from '../../features/auth';
import { ProfileAvatar } from '../../features/settings/components/ProfileAvatar';
import { useAppPreferences } from '../../features/settings/hooks/useAppPreferences';
import { useProfile } from '../../features/settings/hooks/useSettings';

/** Grace period so the pointer can cross the gap between the account button and its menu. */
const HOVER_CLOSE_DELAY_MS = 180;

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
  const { data: profile } = useProfile();
  const { accountMenuTrigger } = useAppPreferences().preferences;
  const location = useLocation();
  const navigate = useNavigate();

  const contentAreaRef = useRef<HTMLElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const prevPathRef = useRef<string>(location.pathname);
  const isInitialMount = useRef(true);
  const [metrics, setMetrics] = useState<{ top: number; height: number } | null>(null);
  const [mode, setMode] = useState<'sliding' | 'entering' | 'exiting' | 'hidden'>('hidden');
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opensOnHover = accountMenuTrigger === 'hover';

  const accountName = profile?.fullName?.trim() || 'Your account';

  useLayoutEffect(() => {
    const contentArea = contentAreaRef.current;
    if (!contentArea) return;

    contentArea.scrollTop = 0;
    contentArea.scrollLeft = 0;
  }, [location.pathname]);

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

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsAccountMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    return () => {
      if (hoverCloseTimerRef.current) clearTimeout(hoverCloseTimerRef.current);
    };
  }, []);

  function cancelHoverClose() {
    if (!hoverCloseTimerRef.current) return;
    clearTimeout(hoverCloseTimerRef.current);
    hoverCloseTimerRef.current = null;
  }

  // Touch and pen have no hover, so they keep using tap to open.
  function handleFooterPointerEnter(event: React.PointerEvent) {
    if (!opensOnHover || event.pointerType !== 'mouse') return;
    cancelHoverClose();
    setIsAccountMenuOpen(true);
  }

  function handleFooterPointerLeave(event: React.PointerEvent) {
    if (!opensOnHover || event.pointerType !== 'mouse') return;
    cancelHoverClose();
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      setIsAccountMenuOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }

  async function handleSignOut() {
    setIsAccountMenuOpen(false);
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
            <svg viewBox="0 0 32 32" fill="none">
              <rect x="3" y="5" width="26" height="24" rx="6" fill="currentColor" />
              <path d="M3 12h26" stroke="var(--color-bg-sidebar)" strokeWidth="2" />
              <path
                d="m10 20 4 4 8-9"
                stroke="var(--color-on-accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 3v5M22 3v5"
                stroke="var(--color-on-accent)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className={styles.brandName}>BPlan</span>
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
          </div>
        </nav>

        <div
          ref={accountMenuRef}
          className={styles.sidebarFooter}
          onPointerEnter={handleFooterPointerEnter}
          onPointerLeave={handleFooterPointerLeave}
        >
          {isAccountMenuOpen && (
            <div className={styles.accountMenu} role="menu" aria-label="Account menu">
              <NavLink
                to="/settings"
                className={styles.accountMenuItem}
                role="menuitem"
                onClick={() => setIsAccountMenuOpen(false)}
              >
                <SettingsIcon />
                <span>Settings</span>
              </NavLink>
              <button
                type="button"
                className={`${styles.accountMenuItem} ${styles.accountMenuSignOut}`}
                onClick={handleSignOut}
                role="menuitem"
              >
                <SignOutIcon />
                <span>Sign out</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className={`${styles.accountButton} ${
              isAccountMenuOpen ? styles.accountButtonOpen : ''
            }`}
            onClick={(event) => {
              // A mouse click on a hover-opened menu keeps it open instead of
              // toggling it shut; keyboard activation (detail 0) still toggles.
              if (opensOnHover && event.detail > 0 && isAccountMenuOpen) return;
              setIsAccountMenuOpen((open) => !open);
            }}
            aria-label="Open account menu"
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
            title={email ?? accountName}
          >
            <ProfileAvatar
              label={profile?.fullName || email}
              imageUrl={profile?.avatarUrl}
              className={styles.userAvatar}
            />
            <span className={styles.userMeta}>
              <span className={styles.userName}>{accountName}</span>
              {email && <span className={styles.userEmail}>{email}</span>}
            </span>
            <svg
              className={styles.accountChevron}
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
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className={styles.mainContent}>
        <main
          ref={contentAreaRef}
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
