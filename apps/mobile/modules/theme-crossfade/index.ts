import { requireOptionalNativeModule } from 'expo';

interface ThemeCrossfadeNativeModule {
  begin(): Promise<boolean>;
  finish(durationMs: number): void;
}

/**
 * Absent on Android, in Expo Go, and in development builds made before this
 * module was added — callers then change the theme instantly.
 */
const native = requireOptionalNativeModule<ThemeCrossfadeNativeModule>('ThemeCrossfade');

/** Covers the window with a snapshot of itself; resolves `false` when it could not. */
export async function beginThemeCrossfade(): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.begin();
  } catch {
    return false;
  }
}

/** Fades the snapshot out over the repainted app. */
export function finishThemeCrossfade(durationMs: number): void {
  native?.finish(durationMs);
}
