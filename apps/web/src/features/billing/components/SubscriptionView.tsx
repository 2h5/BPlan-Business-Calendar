import { useEffect, useState } from 'react';

import styles from './SubscriptionView.module.css';
import { env } from '../../../lib/env';
import { useAuth } from '../../auth';
import { useSubscription } from '../hooks/useBilling';
import {
  checkoutAvailability,
  revenueCatCheckoutUrl,
  type BillingConfig,
  type CheckoutAvailability,
} from '../utils/billing-checkout';
import {
  calculateBillingIntervalSavings,
  FREE_PLAN,
  getSubscriptionStatusInfo,
  PLAN_COMPARISON,
  PRO_PLAN,
} from '../utils/subscription-display';

const billingConfig: BillingConfig = {
  mode: env.billingMode,
  purchaseUrl: env.revenueCatWebPurchaseUrl,
  sellerIdentityConfirmed: env.billingSellerIdentityConfirmed,
  legalDocsFinal: env.billingLegalDocsFinal,
  termsUrl: env.billingTermsUrl,
  privacyUrl: env.billingPrivacyUrl,
};

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

export function SubscriptionView() {
  const { userId } = useAuth();
  const subscription = useSubscription();
  const [interval, setInterval] = useState<BillingInterval>('annual');

  const availability = checkoutAvailability(billingConfig);
  const checkoutUrl = revenueCatCheckoutUrl(billingConfig, userId);
  const statusInfo = getSubscriptionStatusInfo(subscription.data);
  const savings = calculateBillingIntervalSavings(PRO_PLAN.monthlyPrice, PRO_PLAN.annualPrice);
  const displayedPrice = interval === 'annual' ? PRO_PLAN.annualPrice : PRO_PLAN.monthlyPrice;

  const isProActive = statusInfo.state === 'active';
  const isFree = statusInfo.state === 'free';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Plans &amp; <span>Pro</span>
        </h1>
        <p className={styles.subtitle}>
          Start with the essentials, then unlock AI scheduling when you&apos;re ready.
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
      </header>

      <section className={styles.cards} aria-label="BPlan plans">
        <article className={styles.card}>
          <div>
            <h2>{FREE_PLAN.name}</h2>
            <p className={styles.tagline}>{FREE_PLAN.tagline}</p>
            <p className={styles.price}>
              <span className={styles.priceAmount}>$0</span>
              <small>/ forever</small>
            </p>
          </div>
          <ul className={styles.features}>
            {FREE_PLAN.features.map((feature) => (
              <li key={feature.id}>
                <CheckIcon /> {feature.name}
              </li>
            ))}
          </ul>
          <div className={`${styles.cta} ${styles.ctaMuted}`}>
            {isFree ? 'Current plan' : 'Included'}
          </div>
        </article>

        <article className={`${styles.card} ${styles.cardPro}`}>
          {PRO_PLAN.badge ? <span className={styles.badge}>{PRO_PLAN.badge}</span> : null}
          <div>
            <h2>{PRO_PLAN.name}</h2>
            <p className={styles.tagline}>{PRO_PLAN.tagline}</p>
            <p className={styles.price} aria-live="polite">
              <span className={styles.priceAmount}>
                $<RollingPrice value={displayedPrice.toFixed(2)} numericValue={displayedPrice} />
              </span>
              <small key={interval} className={styles.priceDetail}>
                / {interval === 'annual' ? 'year' : 'month'}
              </small>
            </p>
            <p key={interval} className={`${styles.billingNote} ${styles.priceDetail}`}>
              {interval === 'annual'
                ? `Billed annually ($${(PRO_PLAN.annualPrice / 12).toFixed(2)}/month).`
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
          {isProActive ? (
            <div className={`${styles.cta} ${styles.ctaActive}`}>Current plan</div>
          ) : checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              referrerPolicy="no-referrer"
              className={`${styles.cta} ${styles.ctaPrimary}`}
            >
              {availability === 'sandbox' ? 'Open sandbox checkout' : 'Upgrade to Pro'}
            </a>
          ) : (
            <>
              <div className={`${styles.cta} ${styles.ctaMuted}`}>Checkout unavailable</div>
              <p className={styles.guardNotice} role="status">
                {availabilityMessage(availability)}
              </p>
            </>
          )}
        </article>
      </section>

      <section className={styles.comparison} aria-labelledby="comparison-title">
        <h2 id="comparison-title">Plan comparison</h2>
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

      <footer className={styles.footer}>
        Payments processed by RevenueCat and Stripe ·{' '}
        <a href="/terms.html" target="_blank" rel="noreferrer">
          Terms
        </a>{' '}
        ·{' '}
        <a href="/privacy.html" target="_blank" rel="noreferrer">
          Privacy
        </a>
      </footer>
    </div>
  );
}

function availabilityMessage(availability: CheckoutAvailability): string {
  switch (availability) {
    case 'sandbox':
      return 'Sandbox checkout is for developer and tester verification only.';
    case 'production':
      return 'Hosted checkout is active.';
    case 'production-blocked':
      return 'Production checkout is temporarily paused pending seller-identity and final legal document review.';
    case 'unconfigured':
      return 'Checkout URL is not configured yet.';
    case 'disabled':
      return 'Checkout is currently disabled while legal and payment setup is finalized.';
  }
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
