/**
 * Webhook bodies shaped like RevenueCat's documented samples
 * (https://www.revenuecat.com/docs/integrations/webhooks/sample-events and
 * event-types-and-fields). Field sets are kept as documented — including the
 * fields each type omits — with only identifiers, timestamps, and the
 * entitlement lookup key changed to this project's values. Test-only.
 */

export const USER = '0f8b3a52-6c1e-4b8e-9a51-2d7c4e9f1a01';
export const OTHER_USER = '7c2d9e41-3b5a-4f0c-8e62-9a1b5d3c7e02';
export const ANONYMOUS = '$RCAnonymousID:12345678123412341234123456789123';

const EVENT_AT = 1_760_000_000_000;
const PERIOD_END = 1_762_592_000_000;

export type Body = { api_version: string; event: Record<string, unknown> };

/** The documented generic lifecycle sample (INITIAL_PURCHASE). */
export function initialPurchase(overrides: Record<string, unknown> = {}): Body {
  return {
    api_version: '1.0',
    event: {
      aliases: [USER],
      app_id: 'app48a77253da',
      app_user_id: USER,
      commission_percentage: 0.3,
      country_code: 'US',
      currency: 'USD',
      entitlement_id: 'pro',
      entitlement_ids: ['pro'],
      environment: 'SANDBOX',
      event_timestamp_ms: EVENT_AT,
      expiration_at_ms: PERIOD_END,
      id: 'evt-initial-purchase',
      is_family_share: false,
      offer_code: null,
      original_app_user_id: USER,
      original_transaction_id: '1530648507000',
      period_type: 'NORMAL',
      presented_offering_id: 'bplan_web',
      price: 9.99,
      price_in_purchased_currency: 9.99,
      product_id: 'bplan_pro_monthly',
      purchased_at_ms: EVENT_AT - 2_000,
      store: 'RC_BILLING',
      subscriber_attributes: {
        $email: { updated_at_ms: EVENT_AT, value: 'customer@example.com' },
      },
      takehome_percentage: 0.7,
      tax_percentage: 0.3,
      transaction_id: '170000869511114',
      type: 'INITIAL_PURCHASE',
      ...overrides,
    },
  };
}

/** A refund: CANCELLATION with cancel_reason CUSTOMER_SUPPORT, expiry before the event. */
export function refundCancellation(): Body {
  return initialPurchase({
    id: 'evt-refund',
    type: 'CANCELLATION',
    cancel_reason: 'CUSTOMER_SUPPORT',
    price: -9.99,
    price_in_purchased_currency: -9.99,
    event_timestamp_ms: EVENT_AT + 900_000,
    expiration_at_ms: EVENT_AT - 10_000,
  });
}

/** Scheduled pause: expiration_at_ms is the end of the paid period. */
export function subscriptionPaused(): Body {
  return initialPurchase({
    id: 'evt-paused',
    type: 'SUBSCRIPTION_PAUSED',
    store: 'PLAY_STORE',
    auto_resume_at_ms: PERIOD_END + 2_592_000_000,
    price: 0,
    price_in_purchased_currency: 0,
  });
}

export function expiration(): Body {
  return initialPurchase({
    id: 'evt-expiration',
    type: 'EXPIRATION',
    expiration_reason: 'UNSUBSCRIBE',
    event_timestamp_ms: PERIOD_END + 1_000,
  });
}

export function refundReversed(): Body {
  return initialPurchase({ id: 'evt-refund-reversed', type: 'REFUND_REVERSED' });
}

/** The documented TRANSFER sample: no app_user_id, entitlements, or expiry. */
export function transfer(from: string[] = [OTHER_USER], to: string[] = [USER]): Body {
  return {
    event: {
      app_id: 'app48a77253da',
      event_timestamp_ms: EVENT_AT,
      id: 'CD489E0E-5D52-4E03-966B-A7F17788E432',
      store: 'RC_BILLING',
      transferred_from: from,
      transferred_to: to,
      type: 'TRANSFER',
      environment: 'SANDBOX',
    },
    api_version: '1.0',
  };
}

/** The documented PURCHASE_REDEEMED sample shape. */
export function purchaseRedeemed(): Body {
  return {
    event: {
      app_id: 'app48a77253da',
      event_timestamp_ms: EVENT_AT,
      id: 'evt-redeemed',
      store: 'RC_BILLING',
      environment: 'SANDBOX',
      redeemed_from: [ANONYMOUS],
      redeemed_by: [USER],
      redemption_outcome: 'alias',
      redemption_platform: 'ios',
      product_id: 'bplan_pro_monthly',
      entitlement_ids: ['pro'],
      workflow_id: 'wf_abc123',
      workflow_step_id: 'step_xyz789',
      trace_id: 'trace_abcdef',
      type: 'PURCHASE_REDEEMED',
    },
    api_version: '1.0',
  };
}

/** The documented TEMPORARY_ENTITLEMENT_GRANT sample: no environment or entitlements. */
export function temporaryEntitlementGrant(): Body {
  return {
    event: {
      event_timestamp_ms: EVENT_AT,
      app_user_id: USER,
      store: 'APP_STORE',
      type: 'TEMPORARY_ENTITLEMENT_GRANT',
      id: 'evt-temporary-grant',
      app_id: 'app48a77253da',
    },
    api_version: '1.0',
  };
}

export function invoiceIssuance(): Body {
  return initialPurchase({ id: 'evt-invoice', type: 'INVOICE_ISSUANCE' });
}

export function dashboardTest(): Body {
  return initialPurchase({ id: 'evt-test', type: 'TEST', app_user_id: 'test-user' });
}
