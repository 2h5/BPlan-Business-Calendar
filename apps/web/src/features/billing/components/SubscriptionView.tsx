import { useEffect, useRef, useState } from 'react';

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

interface RollingPriceProps {
  value: string;
  numericValue: number;
}

function RollingPrice({ value, numericValue }: RollingPriceProps) {
  const [display, setDisplay] = useState({ value, numericValue });
  const [previous, setPrevious] = useState<{ value: string; numericValue: number } | null>(null);
  const [direction, setDirection] = useState<'up' | 'down'>('up');

  useEffect(() => {
    if (numericValue !== display.numericValue) {
      setPrevious(display);
      setDisplay({ value, numericValue });
      setDirection(numericValue > display.numericValue ? 'up' : 'down');
    }
  }, [value, numericValue, display]);

  const handleAnimationEnd = () => {
    setPrevious(null);
  };

  return (
    <span className={styles.rollerViewport}>
      <span
        key={display.value}
        className={`${styles.rollItem} ${
          previous ? (direction === 'up' ? styles.rollInUp : styles.rollInDown) : ''
        }`}
        onAnimationEnd={handleAnimationEnd}
      >
        {display.value}
      </span>
      {previous && (
        <span
          key={`prev-${previous.value}`}
          className={`${styles.rollItem} ${styles.rollItemOutgoing} ${
            direction === 'up' ? styles.rollOutUp : styles.rollOutDown
          }`}
          aria-hidden="true"
        >
          {previous.value}
        </span>
      )}
    </span>
  );
}

export function SubscriptionView() {
  const { userId } = useAuth();
  const subscription = useSubscription();
  const [interval, setInterval] = useState<'monthly' | 'annual'>('annual');

  const monthlyBtnRef = useRef<HTMLButtonElement>(null);
  const annualBtnRef = useRef<HTMLButtonElement>(null);
  const [bubbleStyle, setBubbleStyle] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const target = interval === 'monthly' ? monthlyBtnRef.current : annualBtnRef.current;
    if (target) {
      setBubbleStyle({
        left: target.offsetLeft,
        width: target.offsetWidth,
      });
    }
  }, [interval]);

  useEffect(() => {
    function updateBubble() {
      const target = interval === 'monthly' ? monthlyBtnRef.current : annualBtnRef.current;
      if (target) {
        setBubbleStyle({
          left: target.offsetLeft,
          width: target.offsetWidth,
        });
      }
    }
    window.addEventListener('resize', updateBubble);
    return () => window.removeEventListener('resize', updateBubble);
  }, [interval]);

  const availability = checkoutAvailability(billingConfig);
  const checkoutUrl = revenueCatCheckoutUrl(billingConfig, userId);
  const statusInfo = getSubscriptionStatusInfo(subscription.data);

  const savings = calculateBillingIntervalSavings(PRO_PLAN.monthlyPrice, PRO_PLAN.annualPrice);

  const isProActive = statusInfo.state === 'active';
  const isFree = statusInfo.state === 'free';

  return (
    <div className={styles.container}>
      <section className={styles.heroBanner} aria-labelledby="plans-heading">
        <header className={styles.header}>
          <span className={styles.eyebrow}>Plan today. A brighter tomorrow.</span>
          <h1 id="plans-heading" className={styles.title}>
            Choose a plan that keeps you <span>on schedule.</span>
          </h1>
          <p className={styles.subtitle}>
            Start with the essentials, then unlock smarter scheduling when your workflow is ready.
          </p>
          <ul className={styles.heroProof} aria-label="Every plan includes">
            <li>
              <CheckIcon /> Calendar planning
            </li>
            <li>
              <CheckIcon /> Task organization
            </li>
            <li>
              <CheckIcon /> Secure access
            </li>
          </ul>
        </header>

        <div className={styles.heroControlCard}>
          <span className={styles.heroControlEyebrow}>Simple billing</span>
          <h2>Choose your rhythm</h2>
          <p>See Pro pricing monthly or annually. Your current access stays visible below.</p>

          <div className={styles.intervalPicker} role="radiogroup" aria-label="Billing frequency">
            <div className={styles.toggleContainer} data-ready={bubbleStyle !== null}>
              {bubbleStyle && (
                <span
                  className={styles.toggleBubble}
                  style={{
                    transform: `translateX(${bubbleStyle.left}px)`,
                    width: `${bubbleStyle.width}px`,
                  }}
                  aria-hidden="true"
                />
              )}
              <button
                ref={monthlyBtnRef}
                type="button"
                role="radio"
                aria-checked={interval === 'monthly'}
                className={`${styles.toggleOption} ${
                  interval === 'monthly' ? styles.toggleOptionActive : ''
                }`}
                onClick={() => setInterval('monthly')}
              >
                Monthly
              </button>
              <button
                ref={annualBtnRef}
                type="button"
                role="radio"
                aria-checked={interval === 'annual'}
                className={`${styles.toggleOption} ${
                  interval === 'annual' ? styles.toggleOptionActive : ''
                }`}
                onClick={() => setInterval('annual')}
              >
                <span>Annual</span>
                <span className={styles.savingsPill}>Save {savings.savingsPercentage}%</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Cards Grid */}
      <div className={styles.cardsGrid}>
        {/* Free Plan Card */}
        <section className={styles.card} aria-label="Free plan">
          <div className={styles.cardHeader}>
            <h2 className={styles.planName}>{FREE_PLAN.name}</h2>
            <p className={styles.planTagline}>{FREE_PLAN.tagline}</p>
            <div className={styles.priceBlock}>
              <span className={styles.currencySymbol}>$</span>
              <span className={styles.priceAmount}>0</span>
              <span className={styles.priceInterval}>/ month</span>
            </div>
            <span className={styles.priceNote}>{FREE_PLAN.priceNote}</span>
          </div>

          <ul className={styles.featureList}>
            {FREE_PLAN.features.map((feature) => (
              <li key={feature.id} className={styles.featureItem}>
                <CheckIcon />
                <div>
                  <strong>{feature.name}</strong>
                  <span>{feature.description}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.cardAction}>
            <div className={`${styles.ctaButton} ${styles.ctaCurrent}`}>
              {isFree ? 'Current Plan' : 'Free Included'}
            </div>
          </div>
        </section>

        {/* Pro Plan Card */}
        <section className={`${styles.card} ${styles.cardPro}`} aria-label="Pro plan">
          {PRO_PLAN.badge && <span className={styles.cardBadge}>{PRO_PLAN.badge}</span>}

          <div className={styles.cardHeader}>
            <h2 className={styles.planName}>{PRO_PLAN.name}</h2>
            <p className={styles.planTagline}>{PRO_PLAN.tagline}</p>
            <div className={styles.priceBlock}>
              <span className={styles.currencySymbol}>$</span>
              <span className={styles.priceAmount}>
                <RollingPrice
                  value={interval === 'annual' ? '49.99' : '4.99'}
                  numericValue={interval === 'annual' ? 49.99 : 4.99}
                />
              </span>
              <span key={interval} className={styles.priceInterval}>
                {interval === 'annual' ? '/ year' : '/ month'}
              </span>
            </div>
            <span key={interval} className={styles.priceNote}>
              {interval === 'annual'
                ? `Billed annually ($4.17/mo). Save $${savings.savingsDollars.toFixed(2)}/year.`
                : 'Billed monthly. Cancel anytime with no long-term commitment.'}
            </span>
          </div>

          {/* Hero Feature Box: Find Time with AI */}
          <div className={styles.heroFeatureBox}>
            <div className={styles.heroFeatureHeader}>
              <div className={styles.heroFeatureTitle}>
                <StarIcon />
                <span>Find Time with AI</span>
              </div>
              <span className={styles.heroFeatureTag}>HERO FEATURE</span>
            </div>
            <p className={styles.heroFeatureDescription}>
              Describe your meeting in plain English. The server deterministically calculates valid,
              unconflicted slots so times are never hallucinated, then AI ranks and explains the
              best open opportunities for you.
            </p>
            <div className={styles.heroPillList}>
              <span className={styles.heroPill}>✦ Deterministic verification</span>
              <span className={styles.heroPill}>✦ 1-click slot booking</span>
              <span className={styles.heroPill}>✦ Timezone aware</span>
            </div>
          </div>

          <ul className={styles.featureList}>
            {PRO_PLAN.features
              .filter((f) => !f.isHero)
              .map((feature) => (
                <li key={feature.id} className={styles.featureItem}>
                  <CheckIcon />
                  <div>
                    <strong>{feature.name}</strong>
                    <span>{feature.description}</span>
                  </div>
                </li>
              ))}
          </ul>

          {/* Extensible Future Pro Capabilities */}
          {PRO_PLAN.futureFeatures && PRO_PLAN.futureFeatures.length > 0 && (
            <div className={styles.futureSection}>
              <h3 className={styles.futureHeading}>Upcoming Pro capabilities</h3>
              <ul className={styles.futureList}>
                {PRO_PLAN.futureFeatures.map((item, index) => (
                  <li key={index} className={styles.futureItem}>
                    <span className={styles.sparkleDot} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.cardAction}>
            {isProActive ? (
              <div className={`${styles.ctaButton} ${styles.ctaActivePro}`}>
                Current Plan (Active)
              </div>
            ) : checkoutUrl ? (
              <a
                href={checkoutUrl}
                target="_blank"
                rel="noreferrer"
                referrerPolicy="no-referrer"
                className={`${styles.ctaButton} ${styles.ctaPrimary}`}
              >
                {availability === 'sandbox' ? 'Open sandbox checkout' : 'Upgrade to Pro'}
              </a>
            ) : (
              <div>
                <div className={`${styles.ctaButton} ${styles.ctaCurrent}`}>
                  Checkout Currently Unavailable
                </div>
                <p
                  className={`${styles.guardNotice} ${
                    availability === 'production-blocked' || availability === 'disabled'
                      ? styles.guardWarning
                      : styles.guardNote
                  }`}
                  role="status"
                >
                  {availabilityMessage(availability)}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Feature Comparison Matrix */}
      <section className={styles.comparisonSection} aria-label="Feature comparison">
        <div className={styles.comparisonHeader}>
          <h2 className={styles.comparisonTitle}>Detailed Plan Comparison</h2>
          <p className={styles.comparisonSubtitle}>
            Review the exact differences and capabilities included in each tier.
          </p>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.tableColFeature}>Capability</th>
                <th className={styles.tableColFree}>Free</th>
                <th className={styles.tableColPro}>Pro</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON.map((row) => (
                <tr key={row.id}>
                  <td className={styles.tableColFeature}>{row.capability}</td>
                  <td className={styles.tableColFree}>
                    {row.inFree ? (
                      <span className={styles.checkYes}>✓</span>
                    ) : (
                      <span className={styles.checkNo}>—</span>
                    )}
                  </td>
                  <td className={styles.tableColPro}>
                    <span className={styles.checkYes}>
                      {row.proLabel ? `✓ ${row.proLabel}` : '✓'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trust & Safeguard Footer */}
      <footer className={styles.trustFooter}>
        <p>
          Payments are securely processed via <strong>RevenueCat Billing</strong> and{' '}
          <strong>Stripe</strong>. After checkout, click <em>Refresh access status</em> to
          immediately sync your subscription entitlement while webhooks finish processing.
        </p>
        <div className={styles.legalLinks}>
          <a href="/terms.html" target="_blank" rel="noreferrer" className={styles.legalLink}>
            Terms &amp; Conditions
          </a>
          <span>·</span>
          <a href="/privacy.html" target="_blank" rel="noreferrer" className={styles.legalLink}>
            Privacy Policy
          </a>
        </div>
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
    <svg
      className={styles.checkIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.85 7.15L22 12l-7.15 2.85L12 22l-2.85-7.15L2 12l7.15-2.85L12 2z" />
    </svg>
  );
}
