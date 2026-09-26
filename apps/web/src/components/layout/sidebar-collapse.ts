import { type SidebarOnLaunch } from '@cal/schemas';

/**
 * Whether the sidebar is collapsed to its icon rail. The last state is kept per
 * browser rather than per account: the right choice depends on the screen, not
 * the person. The account's `sidebarOnLaunch` preference can override it.
 */
const SIDEBAR_COLLAPSED_KEY = 'bplan_sidebar_collapsed';

export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    // localStorage unavailable or restricted
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // localStorage unavailable or restricted
  }
}

/** How the sidebar starts when the app loads. */
export function initialSidebarCollapsed(onLaunch: SidebarOnLaunch): boolean {
  if (onLaunch === 'open') return false;
  if (onLaunch === 'collapsed') return true;
  return readSidebarCollapsed();
}
