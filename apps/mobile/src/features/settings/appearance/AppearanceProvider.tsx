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

import { FAST_MOTION_STORAGE_KEY, motionScaleFor, parseFastMotion } from './motion-speed';
import {
  THEME_STORAGE_KEY,
  isValidThemeMode,
  resolveThemeMode,
  type ThemeMode,
} from './theme-mode';
import { beginThemeCrossfade, finishThemeCrossfade } from '../../../../modules/theme-crossfade';
import { logError } from '../../../lib/logger';

export interface AppearanceContextValue {
  /** What the user chose. */
  mode: ThemeMode;
  /** What that currently resolves to, after the OS has its say. */
  scheme: ColorScheme;
  setMode: (mode: ThemeMode) => void;
  /** Every animation at twice its normal speed. */
  fastMotion: boolean;
  setFastMotion: (fastMotion: boolean) => void;
}

/** The web's theme cross-fade (`::view-transition-*` in global.css). */
const CROSSFADE_MS = 320;

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
  const [fastMotion, setFastMotionState] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [storedMode, storedFastMotion] = await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(FAST_MOTION_STORAGE_KEY),
        ]);
        if (!active) return;
        if (isValidThemeMode(storedMode)) setModeState(storedMode);
        setFastMotionState(parseFastMotion(storedFastMotion));
      } catch (error) {
        logError(error);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Changes the palette as one smooth cross-fade, as the web does: native code
   * covers the window with a snapshot of the old theme, the new one paints
   * underneath, and the snapshot fades out. Without the native module (or
   * with Reduce Motion) the change is instant.
   */
  const setMode = useCallback(
    (next: ThemeMode) => {
      void AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(logError);

      void (async () => {
        const covered = await beginThemeCrossfade();
        setModeState(next);
        if (covered) {
          const durationMs = CROSSFADE_MS * motionScaleFor(fastMotion);
          afterNextPaint(() => finishThemeCrossfade(durationMs));
        }
      })();
    },
    [fastMotion],
  );

  const setFastMotion = useCallback((next: boolean) => {
    void AsyncStorage.setItem(FAST_MOTION_STORAGE_KEY, String(next)).catch(logError);
    setFastMotionState(next);
  }, []);

  const scheme = resolveThemeMode(mode, systemScheme);
  const motionScale = motionScaleFor(fastMotion);

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
    () => ({ mode, scheme, setMode, fastMotion, setFastMotion }),
    [mode, scheme, setMode, fastMotion, setFastMotion],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <ThemeProvider scheme={scheme} motionScale={motionScale}>
        {children}
      </ThemeProvider>
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance must be used inside <AppearanceProvider>');
  return context;
}

/**
 * Runs once the re-render has reached the screen: two frames for React to
 * commit, and a beat more for the native chrome that follows
 * `Appearance.setColorScheme` — fading the snapshot any earlier shows the
 * repaint happening.
 */
function afterNextPaint(callback: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(callback, 32)));
}
