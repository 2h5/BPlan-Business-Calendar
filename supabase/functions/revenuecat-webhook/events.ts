import {
  isAnonymousAppUserId,
  type RevenueCatEvent,
  type SubscriptionStatus,
} from '@cal/schemas/subscription';

/**
 * Pure event interpretation. No IO, no Supabase, no clock — everything this
 * needs arrives in the event, so every branch below is directly testable.
 */

export type IgnoreReason =
  | 'ANONYMOUS_APP_USER_ID'
  | 'APP_USER_ID_NOT_A_USER'
  | 'NO_ENTITLEMENTS'
  | 'TEST_EVENT'
  | 'UNHANDLED_EVENT_TYPE';

export type EventDecision =
  | { kind: 'ignore'; reason: IgnoreReason }
  | {
      kind: 'write';
      userId: string;
      entitlements: string[];
      status: SubscriptionStatus;
      expiresAt: string | null;
      /** Users losing the entitlement on a TRANSFER. Usually empty. */
      revokeFrom: string[];
    };

/**
 * Event types that leave the entitlement usable.
 *
 * CANCELLATION and BILLING_ISSUE belong here deliberately. Both mean "will not
 * renew", not "access ends now": the user keeps what they paid for until
 * `expires_at`, and EXPIRATION arrives later to close it out. Treating either
 * as an immediate revocation would take back paid time — and would break the
 * "cancelled but active-until-expiry" case Sprint 6 requires.
 */
const ACTIVATING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'CANCELLATION',
  'BILLING_ISSUE',
  'TRANSFER',
]);

const EXPIRING_EVENTS = new Set(['EXPIRATION']);
const PAUSING_EVENTS = new Set(['SUBSCRIPTION_PAUSED']);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decideEvent(event: RevenueCatEvent): EventDecision {
  if (event.type === 'TEST') return { kind: 'ignore', reason: 'TEST_EVENT' };

  // A purchase made before sign-in. It cannot be attributed to a user yet;
  // RevenueCat re-delivers it as TRANSFER once `logIn` resolves identity.
  if (isAnonymousAppUserId(event.app_user_id)) {
    return { kind: 'ignore', reason: 'ANONYMOUS_APP_USER_ID' };
  }

  // The client sets app_user_id to the Supabase auth user id. Anything else is
  // a misconfigured SDK, and guessing at it would write a bogus mirror row.
  if (!UUID_PATTERN.test(event.app_user_id)) {
    return { kind: 'ignore', reason: 'APP_USER_ID_NOT_A_USER' };
  }

  const entitlements = event.entitlement_ids ?? [];
  if (entitlements.length === 0) {
    return { kind: 'ignore', reason: 'NO_ENTITLEMENTS' };
  }

  const status = statusFor(event.type);
  if (status === null) return { kind: 'ignore', reason: 'UNHANDLED_EVENT_TYPE' };

  return {
    kind: 'write',
    userId: event.app_user_id,
    entitlements,
    status,
    expiresAt: toIsoOrNull(event.expiration_at_ms),
    revokeFrom: revokedSenders(event),
  };
}

function statusFor(type: string): SubscriptionStatus | null {
  if (ACTIVATING_EVENTS.has(type)) return 'active';
  if (EXPIRING_EVENTS.has(type)) return 'expired';
  if (PAUSING_EVENTS.has(type)) return 'paused';
  return null;
}

/**
 * On a TRANSFER the entitlement moves between customers: `app_user_id` gains
 * it and everyone in `transferred_from` loses it. Anonymous senders are
 * dropped — they never had a mirror row to revoke.
 */
function revokedSenders(event: RevenueCatEvent): string[] {
  if (event.type !== 'TRANSFER') return [];
  return (event.transferred_from ?? []).filter(
    (id) => !isAnonymousAppUserId(id) && UUID_PATTERN.test(id) && id !== event.app_user_id,
  );
}

/** RevenueCat sends epoch milliseconds; null means no expiry (lifetime). */
export function toIsoOrNull(millis: number | null | undefined): string | null {
  if (millis === null || millis === undefined) return null;
  return new Date(millis).toISOString();
}
