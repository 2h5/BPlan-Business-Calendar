import { z } from 'zod';

/**
 * RevenueCat webhook payloads and the entitlement mirror.
 *
 * RevenueCat event types do not share one shape. Subscription lifecycle events
 * carry `app_user_id`, `entitlement_ids`, and `expiration_at_ms`; TRANSFER
 * carries only `transferred_from`/`transferred_to`; PURCHASE_REDEEMED carries
 * `redeemed_by`/`redeemed_from`; TEMPORARY_ENTITLEMENT_GRANT carries only
 * `app_user_id` (https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
 * So parsing is two-stage:
 *
 * 1. The envelope requires only what every event has (`id`, `type`,
 *    `event_timestamp_ms`). `type` is a plain string: RevenueCat adds event
 *    types over time, and an unrecognised one must be recorded and ignored.
 *    RevenueCat retries every non-200 response, so rejecting a whole class of
 *    valid deliveries at the envelope would turn a provider change into a
 *    retry storm followed by silent loss.
 * 2. Each handled type is then parsed with its own schema. A body that fails
 *    its type schema is still recorded under its event ID.
 */

/** RevenueCat sends epoch milliseconds; the database stores timestamptz. */
const epochMillisSchema = z.number().int().nonnegative();

export const revenueCatEnvironmentSchema = z.enum(['SANDBOX', 'PRODUCTION']);
export type RevenueCatEnvironment = z.infer<typeof revenueCatEnvironmentSchema>;

export const revenueCatWebhookEnvelopeSchema = z.object({
  api_version: z.string().optional(),
  event: z
    .object({
      id: z.string().min(1).max(255),
      type: z.string().min(1).max(64),
      event_timestamp_ms: epochMillisSchema,
      /**
       * Deliberately a plain string here. An unexpected value is recorded as
       * ENVIRONMENT_INVALID under the event ID rather than rejected unaudited.
       */
      environment: z.string().nullish(),
    })
    .passthrough(),
});

export type RevenueCatWebhookEnvelope = z.infer<typeof revenueCatWebhookEnvelopeSchema>;
export type RevenueCatEnvelopeEvent = RevenueCatWebhookEnvelope['event'];

/**
 * Subscription lifecycle events. `app_user_id` equals the Supabase auth user
 * id, because checkout identifies the customer with it; anything prefixed
 * `$RCAnonymousID:` cannot be attributed. `expiration_at_ms` is documented as
 * always included for lifecycle events; `null` means no expiry and is only
 * accepted for a non-renewing purchase.
 */
export const revenueCatLifecycleEventSchema = z.object({
  app_user_id: z.string().min(1),
  original_app_user_id: z.string().min(1).nullish(),
  entitlement_ids: z.array(z.string().min(1)).nullish(),
  expiration_at_ms: epochMillisSchema.nullable(),
});

/** TRANSFER: sent for the destination; names both sides, but not entitlements. */
export const revenueCatTransferEventSchema = z.object({
  transferred_from: z.array(z.string().min(1)),
  transferred_to: z.array(z.string().min(1)),
});

/** PURCHASE_REDEEMED: a web purchase was associated with an App User ID. */
export const revenueCatRedemptionEventSchema = z.object({
  redeemed_by: z.array(z.string().min(1)),
  redeemed_from: z.array(z.string().min(1)).nullish(),
});

/** Events that name one subscriber but not the resulting access. */
export const revenueCatSubjectEventSchema = z.object({
  app_user_id: z.string().min(1),
});

/**
 * Mirror status values.
 *
 * `active` is the only one `has_active_entitlement()` accepts, and it is
 * deliberately kept through cancellation, billing retries, and a scheduled
 * pause: each means "will not renew", not "access ends now". Access ends when
 * `expires_at` passes, when EXPIRATION arrives, or when reconciliation finds
 * RevenueCat no longer grants it. `paused` is legacy: nothing writes it now,
 * but it remains readable so an old row still parses.
 */
export const subscriptionStatusSchema = z.enum(['active', 'expired', 'paused']);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** The subscription row as the client is allowed to see it — UI only. */
export const subscriptionSchema = z.object({
  entitlement: z.string(),
  status: subscriptionStatusSchema,
  /**
   * Offsets are allowed because this value arrives from PostgREST, which
   * renders `timestamptz` as `2027-09-14T10:36:12.032003+00:00` rather than
   * with a `Z`. Bare `.datetime()` rejects that, which only bites when the
   * column is non-null — that is, only for a subscription that is actually
   * live — and took the whole plan card down with it.
   */
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export type Subscription = z.infer<typeof subscriptionSchema>;

/** RevenueCat's anonymous identifier prefix, used before `logIn` resolves. */
export const REVENUECAT_ANONYMOUS_PREFIX = '$RCAnonymousID:';

export function isAnonymousAppUserId(appUserId: string): boolean {
  return appUserId.startsWith(REVENUECAT_ANONYMOUS_PREFIX);
}
