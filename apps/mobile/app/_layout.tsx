import { useTheme } from '@cal/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSheets } from '../src/components/app-shell/AppSheets';
import { TaskEditorHost } from '../src/components/app-shell/TaskEditorHost';
import { AuthProvider, useAuth } from '../src/features/auth';
import { ReminderSync } from '../src/features/notifications';
import { AppearanceProvider } from '../src/features/settings/appearance/AppearanceProvider';
import { ErrorBoundary } from '../src/lib/errors/ErrorBoundary';
import { queryClient } from '../src/lib/query/query-client';

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
        options={{ headerShown: true, title: 'Connections', animation: 'default' }}
      />
    </Stack>
  );
}

function AuthenticatedOverlays() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <>
      <AppSheets />
      <TaskEditorHost />
      <ReminderSync />
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
