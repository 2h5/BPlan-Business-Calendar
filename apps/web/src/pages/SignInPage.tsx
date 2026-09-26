import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import styles from './pages.module.css';
import { SignInForm, useAuth } from '../features/auth';
import { PricingDecals, PublicHeader, usePricingDecalsExit } from '../features/public-site';

type PreviewEventTone = 'sky' | 'blue' | 'lavender' | 'green';

interface PreviewEvent {
  title: string;
  time: string;
  tone: PreviewEventTone;
}

interface PreviewDay {
  date: number;
  month: 'March' | 'April' | 'May';
  event?: PreviewEvent;
}

const PREVIEW_EVENTS: Partial<Record<number, PreviewEvent>> = {
  1: { title: 'Product planning', time: '10:00 – 11:00', tone: 'sky' },
  3: { title: 'Team standup', time: '9:00 – 9:30', tone: 'sky' },
  8: { title: 'Client review', time: '2:00 – 3:00', tone: 'blue' },
  14: { title: 'Marketing sync', time: '11:00 – 12:00', tone: 'lavender' },
  17: { title: 'Roadmap discussion', time: '10:00 – 11:00', tone: 'green' },
  22: { title: 'Q2 planning', time: '1:00 – 2:00', tone: 'sky' },
  30: { title: 'Team social', time: '4:00 – 5:00', tone: 'lavender' },
};

const CALENDAR_DAYS: PreviewDay[] = [
  { date: 30, month: 'March' },
  { date: 31, month: 'March' },
  ...Array.from({ length: 30 }, (_, index) => ({
    date: index + 1,
    month: 'April' as const,
    event: PREVIEW_EVENTS[index + 1],
  })),
  { date: 1, month: 'May' },
  { date: 2, month: 'May' },
  { date: 3, month: 'May' },
];

export function SignInPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const pricingDecals = usePricingDecalsExit();
  const signInPanelRef = useRef<HTMLElement>(null);

  const scrollToSignIn = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !window.matchMedia('(max-width: 920px)').matches ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    const panel = signInPanelRef.current;
    if (!panel) return;

    window.scrollTo({
      top: window.scrollY + panel.getBoundingClientRect().top - 16,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const destination =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/today';

  useEffect(() => {
    document.title = 'BPlan | Sign In';
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, destination]);

  return (
    <div className={styles.loginPage}>
      <PublicHeader onAccountAction={scrollToSignIn} />
      {pricingDecals.isExiting ? (
        <PricingDecals mode="exit" onExited={pricingDecals.onExited} />
      ) : null}

      <main className={styles.loginLayout}>
        <section className={styles.loginHero} aria-labelledby="login-hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>Plan today. A brighter tomorrow.</p>
            <h1 id="login-hero-title" className={styles.heroTitle}>
              Your business
              <br />
              on <span>schedule</span>
            </h1>
            <p className={styles.heroDescription}>
              BPlan helps teams plan, coordinate, and achieve more with a smarter calendar built for
              business.
            </p>
            <ul className={styles.heroBenefits} aria-label="BPlan benefits">
              <li>
                <BenefitCheck /> Sync all your calendars
              </li>
              <li>
                <BenefitCheck /> Schedule with ease
              </li>
              <li>
                <BenefitCheck /> Get more done
              </li>
            </ul>
          </div>

          <CalendarPreview />
        </section>

        <section ref={signInPanelRef} className={styles.loginPanel} aria-label="Sign in to BPlan">
          <SignInForm onSuccess={() => navigate(destination, { replace: true })} />

          <div className={styles.providerStrip} aria-label="Supported calendar providers">
            <span>
              <ProviderCalendarIcon /> Google Calendar
            </span>
            <span>
              <MicrosoftIcon /> Outlook
            </span>
            <span>
              <AppleIcon /> Apple Calendar
            </span>
          </div>

          <p className={styles.legalLinks}>
            Review the <a href="/terms.html">Terms draft</a> and{' '}
            <a href="/privacy.html">Privacy Policy draft</a>.
          </p>

          <blockquote className={styles.loginQuote}>
            “A more organized business
            <br />
            is a more successful one.”
            <cite>— The BPlan Team</cite>
          </blockquote>
        </section>
      </main>
    </div>
  );
}

function CalendarPreview() {
  return (
    <div className={styles.calendarStage} aria-hidden="true">
      <div className={styles.calendarPreview}>
        <aside className={styles.previewSidebar}>
          <div className={styles.previewBrand}>
            <span className={styles.previewBrandLockup}>
              <CalendarBrandMark />
              <strong>BPlan</strong>
            </span>
            <span className={styles.previewCollapse}>
              <SidebarIcon name="collapse" />
            </span>
          </div>
          <div className={`${styles.previewNavItem} ${styles.previewNavItemActive}`}>
            <SidebarIcon name="calendar" /> Calendar
          </div>
          <div className={styles.previewNavItem}>
            <SidebarIcon name="tasks" /> My tasks
          </div>
          <div className={styles.previewNavItem}>
            <SidebarIcon name="meetings" /> Meetings
          </div>
          <div className={styles.previewNavItem}>
            <SidebarIcon name="team" /> Team
          </div>
          <div className={styles.previewNavItem}>
            <SidebarIcon name="analytics" /> Analytics
          </div>
          <div className={styles.previewNavItem}>
            <SidebarIcon name="settings" /> Settings
          </div>
          <div className={styles.previewCallout}>
            <strong>Turn plans into progress</strong>
            <span>Stay organized. Stay ahead.</span>
            <svg viewBox="0 0 148 84" fill="none" aria-hidden="true">
              <rect
                x="19"
                y="28"
                width="44"
                height="15"
                rx="7.5"
                transform="rotate(-48 19 28)"
                fill="#bad4ff"
              />
              <path d="M35 84 81 37c6-6 15-6 21 0l46 47H35Z" fill="#8db8ff" fillOpacity=".76" />
              <path d="m74 84 46-46c6-6 15-6 21 0l30 31v15H74Z" fill="#2f75ed" fillOpacity=".88" />
              <path d="m107 84 19-20 20 20h-39Z" fill="#d9e8ff" fillOpacity=".9" />
            </svg>
          </div>
        </aside>

        <div className={styles.previewCalendar}>
          <div className={styles.previewToolbar}>
            <span className={styles.previewToday}>Today</span>
            <span>Week</span>
            <strong>Month</strong>
            <span>Agenda</span>
          </div>
          <div className={styles.previewMonthRow}>
            <h2>April 2025</h2>
            <span className={styles.previewMonthControls}>
              <i>‹</i>
              <i>›</i>
            </span>
          </div>
          <div className={styles.previewWeekdays}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className={styles.previewGrid}>
            {CALENDAR_DAYS.map((day) => (
              <div
                key={`${day.month}-${day.date}`}
                className={`${styles.previewDay} ${
                  day.month !== 'April' ? styles.previewDayMuted : ''
                }`}
              >
                <span>{day.date}</span>
                {day.event ? (
                  <span
                    className={`${styles.previewEvent} ${styles[`previewEvent${day.event.tone}`]}`}
                  >
                    <strong>{day.event.title}</strong>
                    <small>{day.event.time}</small>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div className={styles.previewScribble}>
            <svg viewBox="0 0 60 72" fill="none" aria-hidden="true">
              <path
                d="M51 65C27 67 16 54 20 39c3-12 17-14 23-7 5 6-1 14-10 11C19 38 29 17 47 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="m39 10 9-1-2 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              More meetings.
              <br />
              Bigger moves.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarIcon({
  name,
}: {
  name: 'calendar' | 'tasks' | 'meetings' | 'team' | 'analytics' | 'settings' | 'collapse';
}) {
  const paths: Record<typeof name, ReactNode> = {
    calendar: (
      <>
        <rect x="3" y="5" width="14" height="12" rx="2" />
        <path d="M6 3v4M14 3v4M3 9h14" />
      </>
    ),
    tasks: (
      <>
        <rect x="4" y="3" width="12" height="14" rx="2" />
        <path d="m7 10 2 2 4-5" />
      </>
    ),
    meetings: (
      <>
        <rect x="3" y="5" width="14" height="12" rx="2" />
        <path d="M7 3v4M13 3v4" />
      </>
    ),
    team: (
      <>
        <circle cx="8" cy="7" r="2.5" />
        <circle cx="14.5" cy="8" r="2" />
        <path d="M3.5 17c.4-3.3 2-5 4.5-5s4.1 1.7 4.5 5M12 13c2.8-.7 4.4.6 4.8 3" />
      </>
    ),
    analytics: (
      <>
        <path d="M4 16V9M9 16V5M14 16v-4M3 17h14" />
        <path d="m4 7 4-3 4 3 4-5" />
      </>
    ),
    settings: (
      <>
        <circle cx="10" cy="10" r="2.5" />
        <path d="M10 2.5 11.2 4a6 6 0 0 1 1.7.7l1.9-.3 1.5 2.7-1.2 1.5a6 6 0 0 1 0 2.1l1.2 1.5-1.5 2.7-1.9-.3a6 6 0 0 1-1.7.7L10 17.5 8.8 16a6 6 0 0 1-1.7-.7l-1.9.3-1.5-2.7 1.2-1.5a6 6 0 0 1 0-2.1L3.7 7.8l1.5-2.7 1.9.3A6 6 0 0 1 8.8 4L10 2.5Z" />
      </>
    ),
    collapse: (
      <>
        <path d="m7 6-3 4 3 4M13 6l3 4-3 4" />
        <path d="M10 4v12" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  );
}

function CalendarBrandMark() {
  return (
    <span className={styles.loginBrandMark} aria-hidden="true">
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

function BenefitCheck() {
  return (
    <span className={styles.benefitCheck} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none">
        <path
          d="m4 8.2 2.35 2.35L12 5.4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ProviderCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="4" fill="#1f6ff2" />
      <path d="M7 2.5v4M17 2.5v4M3 9h18" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="m8 15 2.2 2.1L16 12"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#f25022" d="M2 2h9v9H2z" />
      <path fill="#7fba00" d="M13 2h9v9h-9z" />
      <path fill="#00a4ef" d="M2 13h9v9H2z" />
      <path fill="#ffb900" d="M13 13h9v9h-9z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.8 12.7c0-2.4 2-3.6 2.1-3.7a4.6 4.6 0 0 0-3.6-2c-1.5-.2-3 .9-3.7.9-.8 0-2-1-3.2-.9a4.8 4.8 0 0 0-4.1 2.5c-1.8 3-.5 7.5 1.2 10 .9 1.2 1.9 2.6 3.2 2.5 1.3 0 1.8-.8 3.4-.8s2 .8 3.4.8 2.3-1.2 3.1-2.5a10.8 10.8 0 0 0 1.4-2.9 4.2 4.2 0 0 1-3.2-3.9ZM14.3 5.4a4.2 4.2 0 0 0 1-3 4.3 4.3 0 0 0-2.8 1.5 4 4 0 0 0-1 2.9 3.6 3.6 0 0 0 2.8-1.4Z" />
    </svg>
  );
}
