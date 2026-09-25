import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';

export interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
}

export const THEME_STORAGE_KEY = 'bplan_theme';

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export function resolveThemeMode(theme: ThemeMode, systemIsLight: boolean): 'light' | 'dark' {
  if (theme === 'auto') {
    return systemIsLight ? 'light' : 'dark';
  }
  return theme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidThemeMode(stored)) {
      return stored;
    }
  } catch {
    // localStorage unavailable or restricted
  }
  return 'auto';
}

/**
 * Applies a palette change without every colour transition animating from the
 * old palette to the new one, which reads as a flash. Transitions are disabled
 * (see `data-theme-switching` in global.css) until the new colours have painted.
 */
function withoutTransitions(apply: () => void): void {
  const root = document.documentElement;
  root.setAttribute('data-theme-switching', '');
  apply();
  // Force a style flush so the new colours land while transitions are off.
  void document.body.offsetHeight;
  const restore = () => root.removeAttribute('data-theme-switching');
  requestAnimationFrame(() => requestAnimationFrame(restore));
  // Animation frames pause in background tabs; never leave transitions off.
  setTimeout(restore, 100);
}

/**
 * Changes the palette as one smooth cross-fade: the browser snapshots the page,
 * the new theme is applied instantly underneath (no per-element transitions),
 * and the snapshot fades out (see `::view-transition-*` in global.css).
 * Falls back to the instant change without View Transitions or with reduced motion.
 */
let latestThemeFade: ViewTransition | null = null;

function crossFadeTheme(apply: () => void): void {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || typeof document.startViewTransition !== 'function') {
    withoutTransitions(apply);
    return;
  }
  const root = document.documentElement;
  root.setAttribute('data-theme-fading', '');
  const transition = document.startViewTransition(() => withoutTransitions(apply));
  latestThemeFade = transition;
  // A quick second change skips this fade; only the latest one clears the flag.
  void transition.finished.finally(() => {
    if (latestThemeFade === transition) root.removeAttribute('data-theme-fading');
  });
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  // Synchronize system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');

    const handler = (e: MediaQueryListEvent) => {
      // The media query has already restyled the page; this cancels the
      // colour transitions it started.
      withoutTransitions(() => undefined);
      setSystemTheme(e.matches ? 'light' : 'dark');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage write error
    }
  }, []);

  // Update HTML data-theme attribute on <html> element
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (root.getAttribute('data-theme') === theme) return;
    crossFadeTheme(() => root.setAttribute('data-theme', theme));
  }, [theme]);

  const resolvedTheme = useMemo<'light' | 'dark'>(() => {
    if (theme === 'auto') {
      return systemTheme;
    }
    return theme;
  }, [theme, systemTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return context;
}
