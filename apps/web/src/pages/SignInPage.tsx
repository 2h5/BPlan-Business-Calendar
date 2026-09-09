import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import styles from './pages.module.css';
import { SignInForm, useAuth } from '../features/auth';

export function SignInPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const destination =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/today';

  useEffect(() => {
    document.title = 'BCal | Sign In';
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, destination]);

  return (
    <div className={styles.loginPage}>
      <Link className={styles.loginBrand} to="/" aria-label="BCal home">
        <span className={styles.loginBrandMark} aria-hidden="true">
          B
        </span>
        <span className={styles.loginBrandName}>BCal</span>
      </Link>

      <main className={styles.loginContent}>
        <SignInForm onSuccess={() => navigate(destination, { replace: true })} />
      </main>
      <p className={styles.legalLinks}>
        Review the <a href="/terms.html">Terms draft</a> and{' '}
        <a href="/privacy.html">Privacy Policy draft</a>.
      </p>
    </div>
  );
}
