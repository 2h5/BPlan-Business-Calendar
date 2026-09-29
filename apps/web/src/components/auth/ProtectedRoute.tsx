import { Fragment } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../../features/auth';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, userId } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: 'var(--color-bg-app)',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)',
        }}
        aria-live="polite"
      >
        <span>Loading BPlan…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Keyed by user so an account switch remounts every signed-in screen:
  // no component state from the previous account survives.
  return (
    <Fragment key={userId}>
      <Outlet />
    </Fragment>
  );
}
