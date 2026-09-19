import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import styles from './PublicPricingView.module.css';
import { useAuth } from '../../auth';
import {
  calculateBillingIntervalSavings,
  FREE_PLAN,
  PLAN_COMPARISON,
  PRO_PLAN,
} from '../utils/subscription-display';

type BillingInterval = 'monthly' | 'annual';

interface RollingPriceProps {
  value: string;
  numericValue: number;
}

function RollingPrice({ value, numericValue }: RollingPriceProps) {
  const [display, setDisplay] = useState({ value, numericValue });
  const [previous, setPrevious] = useState<{ value: string; numericValue: number } | null>(null);
  const [direction, setDirection] = useState<'up' | 'down'>('up');

  useEffect(() => {
    if (numericValue === display.numericValue) return;

    setPrevious(display);
    setDisplay({ value, numericValue });
    setDirection(numericValue > display.numericValue ? 'up' : 'down');
  }, [display, numericValue, value]);

  return (
    <span className={styles.rollerViewport}>
      <span
        key={display.value}
        className={`${styles.rollItem} ${
          previous ? (direction === 'up' ? styles.rollInUp : styles.rollInDown) : ''
        }`}
        onAnimationEnd={() => setPrevious(null)}
      >
        {display.value}
      </span>
      {previous ? (
        <span
          key={`previous-${previous.value}`}
          className={`${styles.rollItem} ${styles.rollItemOutgoing} ${
            direction === 'up' ? styles.rollOutUp : styles.rollOutDown
          }`}
          aria-hidden="true"
        >
          {previous.value}
        </span>
      ) : null}
    </span>
  );
}

export function PublicPricingView() {
  const { isAuthenticated } = useAuth();
  const [interval, setInterval] = useState<BillingInterval>('annual');
  const savings = calculateBillingIntervalSavings(PRO_PLAN.monthlyPrice, PRO_PLAN.annualPrice);
  const accountDestination = isAuthenticated ? '/today' : '/login';
  const proDestination = isAuthenticated ? '/subscription' : '/login';
  const displayedPrice = interval === 'annual' ? PRO_PLAN.annualPrice : PRO_PLAN.monthlyPrice;

  return (
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="pricing-title">
        <p className={styles.eyebrow}>Simple pricing. Bigger plans.</p>
        <h1 id="pricing-title" className={styles.title}>
          Choose a plan that
          <br />
          keeps you <span>on schedule.</span>
        </h1>
        <p className={styles.subtitle}>
          Start with the essentials, then unlock more with powerful planning and AI features as your
          schedule grows.
        </p>

        <div className={styles.intervalControl} role="radiogroup" aria-label="Billing frequency">
          <span
            className={`${styles.intervalIndicator} ${
              interval === 'annual' ? styles.intervalIndicatorAnnual : ''
            }`}
            aria-hidden="true"
          />
          <button
            type="button"
            role="radio"
            aria-checked={interval === 'monthly'}
            className={`${styles.intervalOption} ${
              interval === 'monthly' ? styles.intervalOptionActive : ''
            }`}
            onClick={() => setInterval('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={interval === 'annual'}
            className={`${styles.intervalOption} ${
              interval === 'annual' ? styles.intervalOptionActive : ''
            }`}
            onClick={() => setInterval('annual')}
          >
            <span>Annual</span>
            <span className={styles.savingsBadge}>Save {savings.savingsPercentage}%</span>
          </button>
        </div>
      </section>

      <section className={styles.cards} aria-label="BPlan pricing plans">
        <article className={styles.card}>
          <div>
            <h2>{FREE_PLAN.name}</h2>
            <p className={styles.tagline}>{FREE_PLAN.tagline}</p>
            <p className={styles.price}>
              <span className={styles.currency}>$</span>0 <small>/ forever</small>
            </p>
          </div>
          <ul className={styles.features}>
            {FREE_PLAN.features.map((feature) => (
              <li key={feature.id}>
                <CheckIcon /> {feature.name}
              </li>
            ))}
          </ul>
          <Link className={`${styles.cardCta} ${styles.cardCtaSecondary}`} to={accountDestination}>
            {isAuthenticated ? 'Open BPlan' : 'Get started for free'}
          </Link>
        </article>

        <article className={`${styles.card} ${styles.cardPro}`}>
          <span className={styles.popularBadge}>{PRO_PLAN.badge}</span>
          <div>
            <h2>{PRO_PLAN.name}</h2>
            <p className={styles.tagline}>{PRO_PLAN.tagline}</p>
            <p className={styles.price} aria-live="polite">
              <span className={styles.currency}>$</span>
              <RollingPrice value={displayedPrice.toFixed(2)} numericValue={displayedPrice} />{' '}
              <small key={interval} className={styles.priceInterval}>
                / {interval === 'annual' ? 'year' : 'month'}
              </small>
            </p>
            <p key={interval} className={styles.billingNote}>
              {interval === 'annual'
                ? `Billed annually ($${(PRO_PLAN.annualPrice / 12).toFixed(2)}/month). Save ${savings.savingsPercentage}%.`
                : 'Billed monthly. Cancel anytime.'}
            </p>
          </div>
          <ul className={styles.features}>
            <li>
              <CheckIcon /> Everything in Free
            </li>
            {PRO_PLAN.features
              .filter((feature) => feature.id !== 'all-free-features')
              .map((feature) => (
                <li key={feature.id}>
                  <CheckIcon /> {feature.name}
                </li>
              ))}
          </ul>
          <Link className={`${styles.cardCta} ${styles.cardCtaPrimary}`} to={proDestination}>
            {isAuthenticated ? 'View Pro options' : 'Get Pro'}
          </Link>
        </article>
      </section>

      <section className={styles.comparison} aria-labelledby="comparison-title">
        <div className={styles.comparisonHeading}>
          <h2 id="comparison-title">Detailed Plan Comparison</h2>
          <p>See exactly what&apos;s included in each plan.</p>
        </div>
        <div className={styles.tableScroller}>
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Free</th>
                <th>Pro</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON.map((row) => (
                <tr key={row.id}>
                  <td>{row.capability}</td>
                  <td>
                    <ComparisonValue available={row.inFree} />
                  </td>
                  <td>
                    <ComparisonValue available label={row.proLabel} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.bottomCta}>
        <h2>Ready to plan smarter?</h2>
        <p>Stay organized and get more done with BPlan.</p>
        <Link to={accountDestination}>Get started today</Link>
      </section>
    </main>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="m3.5 9.2 3.2 3.1 7.8-7.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComparisonValue({ available, label }: { available: boolean; label?: string | null }) {
  if (!available) {
    return <span className={styles.unavailable}>—</span>;
  }

  return (
    <span className={styles.available} aria-label={label ?? 'Included'}>
      <CheckIcon />
      {label ? <small>{label}</small> : null}
    </span>
  );
}
