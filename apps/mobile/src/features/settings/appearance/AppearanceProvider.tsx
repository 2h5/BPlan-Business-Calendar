import { ThemeProvider, type ColorScheme } from '@cal/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme } from 'react-native';

import {
  THEME_STORAGE_KEY,
  isValidThemeMode,
  resolveThemeMode,
  type ThemeMode,
} from './theme-mode';
import { logError } from '../../../lib/logger';

export interface AppearanceContextValue {
  /** What the user chose. */
  mode: ThemeMode;
  /** What that currently resolves to, after the OS has its say. */
  scheme: ColorScheme;
  setMode: (mode: ThemeMode) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/**
 * Owns the appearance preference and hands the resolved scheme to the design
 * system's `ThemeProvider`.
 *
 * The stored value is read asynchronously, so the first frame renders under the
 * system appearance and switches once the preference arrives. That is a better
 * trade than blocking the whole tree behind a storage read — and it is
 * invisible unless the user has overridden the system.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (active && isValidThemeMode(stored)) setModeState(stored);
      } catch (error) {
        logError(error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(logError);
  }, []);

  const scheme = resolveThemeMode(mode, systemScheme);

  /**
   * The native chrome the app does not draw itself — the tab bar, alerts, the
   * keyboard, the date picker wheels — follows UIKit's appearance, not our
   * theme. Pushing the choice down to UIKit is what keeps a "Light mode" phone
   * from showing a dark tab bar under a light app.
   */
  useEffect(() => {
    Appearance.setColorScheme(mode === 'auto' ? null : mode);
  }, [mode]);

  const value = useMemo<AppearanceContextValue>(
    () => ({ mode, scheme, setMode }),
    [mode, scheme, setMode],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <ThemeProvider scheme={scheme}>{children}</ThemeProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside <AppearanceProvider>');
  return context;
}
