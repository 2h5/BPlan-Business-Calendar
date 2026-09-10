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
    document.documentElement.setAttribute('data-theme', theme);
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
