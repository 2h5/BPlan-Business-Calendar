import { useRef, useState, type FormEvent, type PointerEvent } from 'react';

import styles from './SignInForm.module.css';
import { signInWithPassword } from '../api/auth.api';

interface SignInFormProps {
  onSuccess?: () => void;
}

export function SignInForm({ onSuccess }: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  function focusInputFromShell(
    event: PointerEvent<HTMLDivElement>,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) {
    const target = event.target;
    if (target instanceof Element && target.closest('input, button')) return;

    event.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signInWithPassword({ email: trimmedEmail, password });
      onSuccess?.();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        setErrorMessage(String(err.message));
      } else {
        setErrorMessage('Failed to sign in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.brand} aria-hidden="true">
        <span className={styles.brandMark}>
          <svg viewBox="0 0 28 28" fill="none">
            <rect x="4" y="5" width="20" height="19" rx="4" fill="currentColor" />
            <path d="M9 3v5M19 3v5M4 10h20" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path
              d="m10 17 2.3 2.2L18 14"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <strong>BPlan</strong>
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to manage your business calendar.</p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {errorMessage && (
          <div id="signin-error" className={styles.errorBanner} role="alert">
            {errorMessage}
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="signin-email">Email address</label>
          <div
            className={`${styles.inputShell} ${errorMessage ? styles.inputError : ''}`}
            onPointerDown={(event) => focusInputFromShell(event, emailInputRef)}
          >
            <MailIcon />
            <input
              id="signin-email"
              ref={emailInputRef}
              type="email"
              autoComplete="email"
              required
              value={email}
              disabled={isSubmitting}
              className={styles.input}
              placeholder="you@company.com"
              aria-invalid={!!errorMessage}
              aria-describedby={errorMessage ? 'signin-error' : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="signin-password">Password</label>
          <div
            className={`${styles.inputShell} ${errorMessage ? styles.inputError : ''}`}
            onPointerDown={(event) => focusInputFromShell(event, passwordInputRef)}
          >
            <LockIcon />
            <input
              id="signin-password"
              ref={passwordInputRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              disabled={isSubmitting}
              className={styles.input}
              placeholder="Enter your password"
              aria-invalid={!!errorMessage}
              aria-describedby={errorMessage ? 'signin-error' : undefined}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className={styles.passwordToggle}
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              disabled={isSubmitting}
            >
              <EyeIcon isOpen={showPassword} />
            </button>
          </div>
        </div>

        <div className={styles.formOptions}>
          <label className={styles.rememberPlaceholder} title="Session preferences coming soon">
            <input type="checkbox" checked readOnly disabled />
            <span className={styles.checkboxVisual} aria-hidden="true">
              <svg viewBox="0 0 12 12" fill="none">
                <path
                  d="m2.5 6.2 2.1 2.1 4.9-5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            Remember me
          </label>
          <button
            type="button"
            className={styles.textPlaceholder}
            disabled
            title="Password recovery coming soon"
          >
            Forgot password?
          </button>
        </div>

        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className={styles.divider}>
        <span>or continue with</span>
      </div>

      <div className={styles.socialButtons} aria-label="Alternative sign-in options coming soon">
        <button type="button" className={styles.socialPlaceholder} disabled>
          <span className={styles.googleGlyph} aria-hidden="true">
            G
          </span>
          Continue with Google
        </button>
        <button type="button" className={styles.socialPlaceholder} disabled>
          <span className={styles.microsoftGlyph} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          Continue with Microsoft
        </button>
      </div>

      <p className={styles.createAccount}>
        Don&apos;t have an account?{' '}
        <button type="button" disabled title="Account creation coming soon">
          Create an account
        </button>
      </p>
    </div>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5 7 7 5.5L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EyeIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.8" />
      {!isOpen ? (
        <path d="m5 4 14 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
