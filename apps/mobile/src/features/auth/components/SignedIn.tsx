import type { ReactNode } from 'react';

import { useAuth } from '../hooks/AuthProvider';

/**
 * Renders its children only while someone is signed in.
 *
 * Signing out clears the session a moment before the app navigates to sign-in.
 * Screens that read the signed-in user go inside this so they unmount first,
 * while the tab bar around them stays put (see `app/(tabs)/_layout.tsx`).
 */
export function SignedIn({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : null;
}
