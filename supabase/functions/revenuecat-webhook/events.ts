import {
  isAnonymousAppUserId,
  revenueCatEnvironmentSchema,
  revenueCatLifecycleEventSchema,
  revenueCatRedemptionEventSchema,
  revenueCatSubjectEventSchema,
  revenueCatTransferEventSchema,
  type RevenueCatEnvelopeEvent,
  type RevenueCatEnvironment,
} from '@cal/schemas/subscription';

/**
 * Pure event interpretation. No IO, no Supabase, no clock — everything this
 * needs arrives in the event and the configured environment, so every branch
 * below is directly testable.
 *
 * Three outcomes:
 *   apply     — the payload itself carries user, entitlements, status and
 *               expiry, in the enforced environment.
 *   reconcile — the payload names users but cannot safely say what access they
 *               now have. Queue an authoritative read of RevenueCat state.
 *   ignore    — terminal; recorded with a reason and acknowledged with 200.
 */

export type IgnoreReason =
  | 'TEST_EVENT'
  | 'ENVIRONMENT_INVALID'
  | 'ENVIRONMENT_MISMATCH'
  | 'ANONYMOUS_APP_USER_ID'
  | 'APP_USER_ID_NOT_A_USER'
  | 'NO_ATTRIBUTABLE_USER'
  | 'MALFORMED_EVENT'
  | 'UNHANDLED_EVENT_TYPE';

export type ApplyStatus = 'active' | 'expired';

export type EventDecision =
  | { kind: 'ignore'; reason: IgnoreReason; appUserId: string | null }
  | {
      kind: 'apply';
      appUserId: string;
      userId: string;
      environment: RevenueCatEnvironment;
      entitlements: string[];
      status: ApplyStatus;
      expiresAt: string | null;
      customerId: string;
    }
  | {
      kind: 'reconcile';
      appUserId: string | null;
      /** The destination or subject, for ledger attribution. */
      primaryUserId: string | null;
      userIds: string[];
    };

/**
 * Event types whose payload can be applied directly, with the status each
 * leaves behind.
 *
 * CANCELLATION, BILLING_ISSUE, and SUBSCRIPTION_PAUSED keep the entitlement
 * active until `expiration_at_ms`. RevenueCat documents SUBSCRIPTION_PAUSED as
 * "scheduled to pause at the end of the current period"; the pause itself ends
 * access through a later EXPIRATION. A refund arrives as CANCELLATION whose
 * `expiration_at_ms` is the refund time, so the expiry clock revokes it.
 * REFUND_REVERSED carries entitlements and a restored expiry.
 */
const APPLY_STATUS: Readonly<Record<string, ApplyStatus>> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  PRODUCT_CHANGE: 'active',
  UNCANCELLATION: 'active',
  NON_RENEWING_PURCHASE: 'active',
  SUBSCRIPTION_EXTENDED: 'active',
  CANCELLATION: 'active',
  BILLING_ISSUE: 'active',
  SUBSCRIPTION_PAUSED: 'active',
  REFUND_REVERSED: 'active',
  EXPIRATION: 'expired',
};

/** Only a non-renewing (for example lifetime) purchase may omit an expiry. */
const MAY_HAVE_NO_EXPIRY = new Set(['NON_RENEWING_PURCHASE']);

/** Bound the users one hint can queue; RevenueCat sends one or two. */
const MAX_HINTED_USERS = 20;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSupabaseUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function decideEvent(
  event: RevenueCatEnvelopeEvent,
  configuredEnvironment: RevenueCatEnvironment,
): EventDecision {
  const appUserId = typeof event.app_user_id === 'string' ? event.app_user_id : null;
  const ignore = (reason: IgnoreReason): EventDecision => ({ kind: 'ignore', reason, appUserId });

  if (event.type === 'TEST') return ignore('TEST_EVENT');

  // Environment is enforced before anything else, so a sandbox event cannot
  // reach a production mirror even if the dashboard sends both.
  let environment: RevenueCatEnvironment | null = null;
  if (event.environment !== null && event.environment !== undefined) {
    const parsed = revenueCatEnvironmentSchema.safeParse(event.environment);
    if (!parsed.success) return ignore('ENVIRONMENT_INVALID');
    if (parsed.data !== configuredEnvironment) return ignore('ENVIRONMENT_MISMATCH');
    environment = parsed.data;
  }

  const applyStatus = APPLY_STATUS[event.type];
  if (applyStatus !== undefined) return decideLifecycle(event, applyStatus, environment, ignore);

  switch (event.type) {
    case 'TRANSFER': {
      const parsed = revenueCatTransferEventSchema.safeParse(event);
      if (!parsed.success) return ignore('MALFORMED_EVENT');
      // Destination first: it is the subject of the ledger row.
      return hint(parsed.data.transferred_to, parsed.data.transferred_from, ignore);
    }
    case 'PURCHASE_REDEEMED': {
      const parsed = revenueCatRedemptionEventSchema.safeParse(event);
      if (!parsed.success) return ignore('MALFORMED_EVENT');
      return hint(parsed.data.redeemed_by, parsed.data.redeemed_from ?? [], ignore);
    }
    case 'TEMPORARY_ENTITLEMENT_GRANT': {
      // Documented without entitlements, expiry, or environment.
      const parsed = revenueCatSubjectEventSchema.safeParse(event);
      if (!parsed.success) return ignore('MALFORMED_EVENT');
      return hint([parsed.data.app_user_id], [], ignore);
    }
    default:
      return ignore('UNHANDLED_EVENT_TYPE');
  }
}

function decideLifecycle(
  event: RevenueCatEnvelopeEvent,
  status: ApplyStatus,
  environment: RevenueCatEnvironment | null,
  ignore: (reason: IgnoreReason) => EventDecision,
): EventDecision {
  const parsed = revenueCatLifecycleEventSchema.safeParse(event);
  if (!parsed.success) {
    // The payload is unusable, but if it still names a real user the
    // authoritative state can be read instead of losing the signal.
    const subject = typeof event.app_user_id === 'string' ? event.app_user_id : null;
    return subject !== null && isSupabaseUserId(subject)
      ? reconcile(subject, [subject])
      : ignore('MALFORMED_EVENT');
  }

  const lifecycle = parsed.data;
  if (isAnonymousAppUserId(lifecycle.app_user_id)) return ignore('ANONYMOUS_APP_USER_ID');
  // Checkout identifies the customer with the Supabase auth UUID. Anything
  // else is a misconfigured caller, and guessing would write a bogus row.
  if (!isSupabaseUserId(lifecycle.app_user_id)) return ignore('APP_USER_ID_NOT_A_USER');

  const userId = lifecycle.app_user_id.toLowerCase();
  const entitlements = lifecycle.entitlement_ids ?? [];
  const expiryUnusable = lifecycle.expiration_at_ms === null && !MAY_HAVE_NO_EXPIRY.has(event.type);

  // Without a provable environment, entitlements, or a usable expiry, the
  // payload cannot be applied safely. RevenueCat's customer state can.
  if (environment === null || entitlements.length === 0 || expiryUnusable) {
    return reconcile(lifecycle.app_user_id, [userId]);
  }

  return {
    kind: 'apply',
    appUserId: lifecycle.app_user_id,
    userId,
    environment,
    entitlements: [...new Set(entitlements)],
    status,
    expiresAt: toIsoOrNull(lifecycle.expiration_at_ms),
    customerId: lifecycle.original_app_user_id ?? lifecycle.app_user_id,
  };
}

function hint(
  primary: readonly string[],
  secondary: readonly string[],
  ignore: (reason: IgnoreReason) => EventDecision,
): EventDecision {
  const userIds = [...new Set([...primary, ...secondary].filter(isAttributable).map(lower))];
  if (userIds.length === 0) return ignore('NO_ATTRIBUTABLE_USER');
  if (userIds.length > MAX_HINTED_USERS) return ignore('MALFORMED_EVENT');
  const primaryUserId = primary.find(isAttributable)?.toLowerCase() ?? null;
  return { kind: 'reconcile', appUserId: primary[0] ?? null, primaryUserId, userIds };
}

function reconcile(appUserId: string, userIds: string[]): EventDecision {
  const normalized = userIds.map(lower);
  return {
    kind: 'reconcile',
    appUserId,
    primaryUserId: normalized[0] ?? null,
    userIds: normalized,
  };
}

function isAttributable(id: string): boolean {
  return !isAnonymousAppUserId(id) && isSupabaseUserId(id);
}

function lower(value: string): string {
  return value.toLowerCase();
}

/** RevenueCat sends epoch milliseconds; null means no expiry (lifetime). */
export function toIsoOrNull(millis: number | null | undefined): string | null {
  if (millis === null || millis === undefined) return null;
  return new Date(millis).toISOString();
}
