import { z } from 'zod';

/**
 * RevenueCat webhook payloads and the entitlement mirror.
 *
 * Two rules shape this file:
 *
 * 1. `type` is a plain string, not an enum. RevenueCat adds event types over
 *    time, and an unrecognised one must be recorded and ignored — never
 *    rejected. A 4xx here would make RevenueCat retry a delivery that can
 *    never succeed, and a schema that fails closed on new event types turns a
 *    routine provider change into an outage.
 * 2. Only fields the handler actually uses are parsed. The untouched remainder
 *    still reaches the ledger, because the raw body is stored alongside.
 */

/** RevenueCat sends epoch milliseconds; the database stores timestamptz. */
const epochMillisSchema = z.number().int().nonnegative();

export const revenueCatEnvironmentSchema = z.enum(['SANDBOX', 'PRODUCTION']);

export const revenueCatEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  /**
   * Equal to the Supabase auth user id, because the client calls
   * `Purchases.logIn(session.user.id)`. Anything prefixed `$RCAnonymousID:`
   * is a purchase made before sign-in and cannot be attributed yet.
   */
  app_user_id: z.string().min(1),
  original_app_user_id: z.string().min(1).optional(),
  event_timestamp_ms: epochMillisSchema,
  /** Null for non-renewing or lifetime purchases. */
  expiration_at_ms: epochMillisSchema.nullish(),
  purchased_at_ms: epochMillisSchema.nullish(),
  entitlement_ids: z.array(z.string()).nullish(),
  product_id: z.string().nullish(),
  store: z.string().nullish(),
  environment: revenueCatEnvironmentSchema.nullish(),
  /** Present on TRANSFER events. */
  transferred_from: z.array(z.string()).nullish(),
  transferred_to: z.array(z.string()).nullish(),
});

export const revenueCatWebhookSchema = z.object({
  api_version: z.string().optional(),
  event: revenueCatEventSchema,
});

export type RevenueCatEvent = z.infer<typeof revenueCatEventSchema>;
export type RevenueCatWebhook = z.infer<typeof revenueCatWebhookSchema>;

/**
 * Mirror status values.
 *
 * `active` is the only one `has_active_entitlement()` accepts, and it is
 * deliberately kept through cancellation and billing retries: both mean "will
 * not renew", not "access ends now". Access ends when `expires_at` passes or
 * an EXPIRATION event arrives.
 */
export const subscriptionStatusSchema = z.enum(['active', 'expired', 'paused']);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** The subscription row as the client is allowed to see it — UI only. */
export const subscriptionSchema = z.object({
  entitlement: z.string(),
  status: subscriptionStatusSchema,
  expiresAt: z.string().datetime().nullable(),
});

export type Subscription = z.infer<typeof subscriptionSchema>;

/** RevenueCat's anonymous identifier prefix, used before `logIn` resolves. */
export const REVENUECAT_ANONYMOUS_PREFIX = '$RCAnonymousID:';

export function isAnonymousAppUserId(appUserId: string): boolean {
  return appUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX);
}
