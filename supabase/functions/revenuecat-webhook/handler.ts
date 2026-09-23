import { revenueCatWebhookSchema } from '@cal/schemas/subscription';

import { decideEvent } from './events.ts';
import { supabaseRevenueCatMirror, type RevenueCatMirror } from './mirror.ts';

/**
 * RevenueCat webhook receiver.
 *
 * Two behaviours drive the shape of this handler:
 *
 * - RevenueCat retries any non-2xx with backoff. So a response code is a
 *   decision about whether redelivery could ever help. Understood-and-ignored
 *   is a 200; only a genuinely transient failure earns a 5xx.
 * - Deliveries repeat and arrive out of order. The database claims the event
 *   ID, applies ordered mirror changes, and records the outcome in one RPC.
 */

export interface RevenueCatWebhookDeps {
  mirror?: RevenueCatMirror;
  readSecret?: () => string | undefined;
}

export async function handleRevenueCatWebhook(
  request: Request,
  deps: RevenueCatWebhookDeps = {},
): Promise<Response> {
  if (request.method !== 'POST') return status(405, 'METHOD_NOT_ALLOWED');

  const expected = (deps.readSecret ?? defaultSecret)();
  if (!expected) {
    // Unconfigured, not unauthorised. 503 so RevenueCat retries after the
    // secret is set instead of discarding real purchase events.
    console.error(JSON.stringify({ code: 'REVENUECAT_WEBHOOK_SECRET_MISSING' }));
    return status(503, 'NOT_CONFIGURED');
  }

  if (!sameSecret(request.headers.get('Authorization'), expected)) {
    return status(403, 'NOT_AUTHORIZED');
  }

  const body = await request.json().catch(() => null);
  const parsed = revenueCatWebhookSchema.safeParse(body);
  if (!parsed.success) {
    // Redelivering an unparseable body cannot help, so do not ask for one.
    console.error(JSON.stringify({ code: 'REVENUECAT_WEBHOOK_MALFORMED' }));
    return status(400, 'VALIDATION_FAILED');
  }

  const event = parsed.data.event;
  const decision = decideEvent(event);
  const mirror = deps.mirror ?? supabaseRevenueCatMirror();
  const eventAt = new Date(event.event_timestamp_ms).toISOString();

  try {
    if (decision.kind === 'ignore') {
      const result = await mirror.processEvent({
        eventId: event.id,
        userId: null,
        eventType: event.type,
        eventAt,
        status: null,
        expiresAt: null,
        customerId: null,
        entitlements: [],
        revokeFrom: [],
        skippedReason: decision.reason,
        payload: parsed.data,
      });
      return status(200, result);
    }

    const result = await mirror.processEvent({
      eventId: event.id,
      userId: decision.userId,
      eventType: event.type,
      eventAt,
      status: decision.status,
      expiresAt: decision.expiresAt,
      customerId: event.original_app_user_id ?? event.app_user_id,
      entitlements: decision.entitlements,
      revokeFrom: decision.revokeFrom,
      skippedReason: null,
      payload: parsed.data,
    });

    return status(200, result);
  } catch (error) {
    // Transient: ask RevenueCat to redeliver. Never echo the payload, which
    // carries store identifiers.
    console.error(
      JSON.stringify({
        code: 'REVENUECAT_WEBHOOK_FAILED',
        eventType: event.type,
        reason: error instanceof Error ? error.name : 'UNKNOWN',
      }),
    );
    return status(500, 'UNKNOWN');
  }
}

function defaultSecret(): string | undefined {
  return Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
}

function status(code: number, result: string): Response {
  return new Response(JSON.stringify({ result }), {
    status: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Length-independent comparison, matching webhook-microsoft's `sameSecret`. */
function sameSecret(actual: string | null | undefined, expected: string): boolean {
  if (!actual) return false;
  const left = new TextEncoder().encode(actual);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
