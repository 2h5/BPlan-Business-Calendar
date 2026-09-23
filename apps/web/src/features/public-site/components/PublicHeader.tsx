import { Link } from 'react-router-dom';

import styles from './PublicHeader.module.css';

interface PublicHeaderProps {
  activePage?: 'pricing';
}

const PREVIEW_NAV_ITEMS = [
  { label: 'Product', hasMenu: true },
  { label: 'Solutions', hasMenu: true },
  { label: 'Resources', hasMenu: true },
] as const;

export function PublicHeader({ activePage }: PublicHeaderProps) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} to="/" aria-label="BPlan home">
        <CalendarBrandMark />
        <span className={styles.brandName}>BPlan</span>
      </Link>

      <nav className={styles.nav} aria-label="Public navigation">
        {PREVIEW_NAV_ITEMS.slice(0, 2).map((item) => (
          <PreviewNavItem key={item.label} {...item} />
        ))}
        <Link
          className={`${styles.navItem} ${activePage === 'pricing' ? styles.navItemActive : ''}`}
          to="/pricing"
          aria-current={activePage === 'pricing' ? 'page' : undefined}
        >
          Pricing
        </Link>
        <PreviewNavItem {...PREVIEW_NAV_ITEMS[2]} />
      </nav>

      <div className={styles.actions} aria-label="Account actions">
        <Link className={styles.signIn} to="/login">
          Sign in
        </Link>
        <Link className={styles.getStarted} to="/login">
          Get started
        </Link>
      </div>
    </header>
  );
}

function PreviewNavItem({ label, hasMenu }: { label: string; hasMenu: boolean }) {
  return (
    <button type="button" className={styles.navItem} disabled title="Coming soon">
      {label}
      {hasMenu ? <ChevronDown /> : null}
    </button>
  );
}

function CalendarBrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
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
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
