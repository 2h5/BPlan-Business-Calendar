import type { Subscription } from '@cal/schemas/subscription';

import { env } from '../../../lib/env';
import { useAuth } from '../../auth';
import styles from '../../settings/components/SettingsView.module.css';
import { useSubscription } from '../hooks/useBilling';
import {
  checkoutAvailability,
  revenueCatCheckoutUrl,
  type BillingConfig,
  type CheckoutAvailability,
} from '../utils/billing-checkout';

const billingConfig: BillingConfig = {
  mode: env.billingMode,
  purchaseUrl: env.revenueCatWebPurchaseUrl,
  sellerIdentityConfirmed: env.billingSellerIdentityConfirmed,
  legalDocsFinal: env.billingLegalDocsFinal,
  termsUrl: env.billingTermsUrl,
  privacyUrl: env.billingPrivacyUrl,
};

export function BillingSection() {
  const { userId } = useAuth();
  const subscription = useSubscription();
  const availability = checkoutAvailability(billingConfig);
  const checkoutUrl = revenueCatCheckoutUrl(billingConfig, userId);

  return (
    <section className={styles.section}>
      <header>
        <div>
          <h3>Plan &amp; billing</h3>
          <p>Subscription access is mirrored from RevenueCat and checked server-side.</p>
        </div>
        <span className={styles.billingBadge}>USD</span>
      </header>
      <div className={styles.billingBody}>
        <div className={styles.billingSummary}>
          <div>
            <strong>{subscriptionLabel(subscription.data)}</strong>
            <span>{subscriptionDetail(subscription.data)}</span>
          </div>
          {subscription.isLoading ? <span>Checking…</span> : null}
        </div>

        <div className={styles.billingFeature}>
          <h4>Pro includes</h4>
          <p>
            Find Time with AI: the server calculates valid open slots, then the AI provider ranks
            and explains those candidates.
          </p>
        </div>

        {subscription.isError ? (
          <p className={styles.billingError} role="alert">
            We could not read your subscription status. Try again later.
          </p>
        ) : null}

        <BillingActions
          availability={availability}
          checkoutUrl={checkoutUrl}
          isRefreshing={subscription.isFetching}
          onRefresh={() => void subscription.refetch()}
        />
      </div>
    </section>
  );
}

function BillingActions({
  availability,
  checkoutUrl,
  isRefreshing,
  onRefresh,
}: {
  availability: CheckoutAvailability;
  checkoutUrl: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className={styles.billingActions}>
      {checkoutUrl ? (
        <a
          className={styles.primary}
          href={checkoutUrl}
          target="_blank"
          rel="noreferrer"
          referrerPolicy="no-referrer"
        >
          {availability === 'sandbox' ? 'Open sandbox checkout' : 'Upgrade to Pro'}
        </a>
      ) : null}
      {env.revenueCatBillingManagementUrl ? (
        <a
          className={styles.secondary}
          href={env.revenueCatBillingManagementUrl}
          target="_blank"
          rel="noreferrer"
          referrerPolicy="no-referrer"
        >
          Manage billing
        </a>
      ) : null}
      <button
        type="button"
        className={styles.secondary}
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        {isRefreshing ? 'Refreshing…' : 'Refresh access status'}
      </button>
      <p className={availabilityMessageClass(availability)} role="status">
        {availabilityMessage(availability)}
        {checkoutUrl
          ? ' After checkout, refresh access status here while the webhook finishes processing.'
          : null}
      </p>
    </div>
  );
}

function subscriptionLabel(subscription: Subscription | null | undefined): string {
  if (!subscription) return 'Free plan';
  if (subscription.status === 'active') return 'Pro active';
  if (subscription.status === 'paused') return 'Pro paused';
  return 'Pro expired';
}

function subscriptionDetail(subscription: Subscription | null | undefined): string {
  if (!subscription) return 'Upgrade when hosted billing is ready.';
  if (!subscription.expiresAt) return 'No recorded expiry.';

  const expiry = new Date(subscription.expiresAt);
  if (Number.isNaN(expiry.getTime())) return 'Expiry date unavailable.';
  return `Current period ends ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(expiry)}.`;
}

function availabilityMessage(availability: CheckoutAvailability): string {
  switch (availability) {
    case 'sandbox':
      return 'Sandbox checkout is for testing only and is not a customer purchase link.';
    case 'production':
      return 'Hosted checkout is available.';
    case 'production-blocked':
      return 'Production checkout is intentionally held until the seller identity and final legal documents are confirmed.';
    case 'unconfigured':
      return 'Checkout is not configured yet.';
    case 'disabled':
      return 'Checkout is disabled while the seller identity and final legal documents are pending.';
  }
}

function availabilityMessageClass(availability: CheckoutAvailability): string | undefined {
  return availability === 'production-blocked' || availability === 'disabled'
    ? styles.billingWarning
    : styles.billingNote;
}
