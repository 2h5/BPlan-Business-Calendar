import { useTheme } from '@cal/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSheets } from '../src/components/app-shell/AppSheets';
import { HeaderBackButton } from '../src/components/app-shell/HeaderBackButton';
import { UndoToast } from '../src/components/app-shell/UndoToast';
import { AuthProvider, useAuth } from '../src/features/auth';
import { ProUpgradeModal } from '../src/features/billing/components/ProUpgradeModal';
import { PurchasesSync } from '../src/features/billing/components/PurchasesSync';
import { ReminderSync } from '../src/features/notifications';
import {
  AppearanceProvider,
  useAppearance,
} from '../src/features/settings/appearance/AppearanceProvider';
import { WidgetSync } from '../src/features/widgets';
import { ErrorBoundary } from '../src/lib/errors/ErrorBoundary';
import { queryClient } from '../src/lib/query/query-client';

/** How long iOS takes to push a screen; react-native-screens' own default too. */
const NATIVE_PUSH_MS = 500;

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

void SplashScreen.preventAutoHideAsync();

/**
 * Redirects between the authenticated and unauthenticated route groups.
 *
 * Kept as its own component so it sits *inside* AuthProvider, and so the
 * navigation rule lives in one place rather than in every screen.
 */
function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    void SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) router.replace('/(auth)/sign-in');
    else if (isAuthenticated && inAuthGroup) router.replace('/(tabs)/today');
  }, [isAuthenticated, isLoading, segments]);

  return null;
}

/**
 * Lives inside the theme so the native header picks up the app's surface and
 * text colours rather than UIKit's defaults.
 */
function RootStack() {
  const theme = useTheme();
  const { fastMotion } = useAppearance();
  // iOS's own push has a fixed length and ignores the app's animation speed,
  // so Fast animations swaps in react-native-screens' copy of it, which
  // takes a duration.
  const push = fastMotion
    ? ({
        animation: 'simple_push',
        animationDuration: NATIVE_PUSH_MS * theme.motion.scale,
      } as const)
    : ({ animation: 'default' } as const);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: theme.colors.background },
        headerStyle: { backgroundColor: theme.colors.backgroundElevated },
        headerTitleStyle: { ...theme.typography.headline, color: theme.colors.textPrimary },
        headerTintColor: theme.colors.accent,
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="settings/integrations"
        options={{
          headerShown: true,
          title: 'Connections',
          headerLeft: () => <HeaderBackButton label="Settings" />,
          ...push,
        }}
      />
      {/* Search opens over whichever tab you were on, so it is a stack screen
          rather than a hidden tab — a hidden tab is not a navigable route. It
          draws its own top bar so the backdrop reaches the top edge. */}
      <Stack.Screen name="search" options={push} />
    </Stack>
  );
}

function AuthenticatedOverlays() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <>
      <AppSheets />
      <ReminderSync />
      <ProUpgradeModal />
      <UndoToast />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ErrorBoundary>
                <AuthGate />
                <WidgetSync />
                <PurchasesSync />
                <RootStack />
                <AuthenticatedOverlays />
              </ErrorBoundary>
            </AuthProvider>
          </QueryClientProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
