import { getSubscriptionStatusInfo, resolveAccentColor } from '@cal/domain';
import { useLayoutEffect } from 'react';

import { useAppPreferences } from './useAppPreferences';
import { useSubscription } from '../../billing';
import { applyAccent } from '../utils/accent-style';

/**
 * Whether the user may pick a custom accent. Null while the entitlement is
 * loading, so callers can avoid flashing a Pro user's color back to blue.
 */
export function useCustomAccentAccess(): boolean | null {
  const subscription = useSubscription();
  if (subscription.isLoading) return null;
  return getSubscriptionStatusInfo(subscription.data).state === 'active';
}

/** The accent the app shows: the saved one, or blue if it is custom and Pro has lapsed. */
export function useResolvedAccent(): string {
  const { preferences } = useAppPreferences();
  const hasPro = useCustomAccentAccess();
  return resolveAccentColor(preferences.accentColor, hasPro);
}

/**
 * Applies the resolved accent for as long as the calling component is mounted.
 * The signed-in app shell calls it, so leaving the app restores BPlan blue.
 * A layout effect paints the cached accent before the first frame.
 */
export function useApplyAccent(): void {
  const accent = useResolvedAccent();

  useLayoutEffect(() => {
    applyAccent(accent);
  }, [accent]);

  useLayoutEffect(() => () => applyAccent(null), []);
}
