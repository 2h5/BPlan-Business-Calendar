import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { useAuth } from './features/auth';
import { CalendarPage } from './pages/CalendarPage';
import { IntegrationsCallbackPage } from './pages/IntegrationsCallbackPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { SignInPage } from './pages/SignInPage';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { TasksPage } from './pages/TasksPage';
import { TodayPage } from './pages/TodayPage';

function RootRedirect() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return <Navigate to={isAuthenticated ? '/today' : '/login'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<SignInPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/settings/integrations/callback" element={<IntegrationsCallbackPage />} />
        <Route element={<AppShell />}>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/upgrade" element={<Navigate to="/subscription" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
