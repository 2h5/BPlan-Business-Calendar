import {
  revenueCatEnvironmentSchema,
  revenueCatWebhookEnvelopeSchema,
  type RevenueCatEnvironment,
  type RevenueCatWebhookEnvelope,
} from '@cal/schemas/subscription';

import { decideEvent } from './events.ts';
import {
  supabaseRevenueCatMirror,
  type ProcessEventInput,
  type RevenueCatMirror,
} from './mirror.ts';
import { constantTimeEqual } from '../_shared/billing/constant-time.ts';
import { SIGNATURE_HEADER, verifyRevenueCatSignature } from './signature.ts';

/**
 * RevenueCat webhook receiver.
 *
 * - RevenueCat retries every non-200 response (5, 10, 20, 40, 80 minutes) and
 *   then stops. So a response code is a decision about whether redelivery
 *   could ever help. Anything understood — applied, deferred to
 *   reconciliation, or terminally ignored with a recorded reason — is a 200.
 *   Only a transient failure earns a 5xx.
 * - Deliveries repeat and arrive out of order. The database claims the event
 *   ID, applies ordered mirror changes or queues reconciliation, and records
 *   the outcome in one RPC.
 * - The deployment's environment is required configuration. An event from the
 *   other environment is recorded and ignored, whatever the dashboard sends.
 */

/** RevenueCat events are a few kilobytes; refuse anything absurd before parsing. */
const MAX_BODY_BYTES = 256 * 1024;

export interface RevenueCatWebhookConfig {
  secret: string | undefined;
  environment: string | undefined;
  signingSecret: string | undefined;
}

export interface RevenueCatWebhookDeps {
  mirror?: RevenueCatMirror;
  readConfig?: () => RevenueCatWebhookConfig;
  nowSeconds?: () => number;
}

export async function handleRevenueCatWebhook(
  request: Request,
  deps: RevenueCatWebhookDeps = {},
): Promise<Response> {
  if (request.method !== 'POST') return status(405, 'METHOD_NOT_ALLOWED');

  const config = (deps.readConfig ?? defaultConfig)();
  const environment = revenueCatEnvironmentSchema.safeParse(config.environment);
  if (!config.secret || !environment.success) {
    // Unconfigured, not unauthorised. 503 so RevenueCat retries after the
    // deployment is configured instead of discarding real purchase events.
    console.error(JSON.stringify({ code: 'REVENUECAT_WEBHOOK_NOT_CONFIGURED' }));
    return status(503, 'NOT_CONFIGURED');
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization || !constantTimeEqual(authorization, config.secret)) {
    return status(403, 'NOT_AUTHORIZED');
  }

  const rawBody = await request.text().catch(() => null);
  if (rawBody === null || new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return status(400, 'VALIDATION_FAILED');
  }

  if (config.signingSecret) {
    const failure = await verifyRevenueCatSignature(
      request.headers.get(SIGNATURE_HEADER),
      rawBody,
      config.signingSecret,
      (deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))(),
    );
    if (failure) {
      console.error(JSON.stringify({ code: 'REVENUECAT_WEBHOOK_SIGNATURE', failure }));
      return status(403, 'NOT_AUTHORIZED');
    }
  }

  const parsed = revenueCatWebhookEnvelopeSchema.safeParse(parseJson(rawBody));
  if (!parsed.success) {
    // Without an event ID nothing can be recorded. RevenueCat will retry a
    // few times; each attempt is logged here without its body.
    console.error(JSON.stringify({ code: 'REVENUECAT_WEBHOOK_MALFORMED' }));
    return status(400, 'VALIDATION_FAILED');
  }

  const event = parsed.data.event;
  const decision = decideEvent(event, environment.data);
  const mirror = deps.mirror ?? supabaseRevenueCatMirror();
  const base = {
    eventId: event.id,
    eventType: event.type,
    eventAt: new Date(event.event_timestamp_ms).toISOString(),
    environment: eventEnvironment(event.environment),
    appUserId: decision.appUserId,
    payload: redactedPayload(parsed.data),
  };

  let input: ProcessEventInput;
  switch (decision.kind) {
    case 'ignore':
      input = {
        ...base,
        decision: 'ignore',
        userId: null,
        status: null,
        expiresAt: null,
        customerId: null,
        entitlements: [],
        reconcileUserIds: [],
        skippedReason: decision.reason,
      };
      break;
    case 'reconcile':
      input = {
        ...base,
        decision: 'reconcile',
        userId: decision.primaryUserId,
        status: null,
        expiresAt: null,
        customerId: null,
        entitlements: [],
        reconcileUserIds: decision.userIds,
        skippedReason: null,
      };
      break;
    case 'apply':
      input = {
        ...base,
        environment: decision.environment,
        decision: 'apply',
        userId: decision.userId,
        status: decision.status,
        expiresAt: decision.expiresAt,
        customerId: decision.customerId,
        entitlements: decision.entitlements,
        reconcileUserIds: decision.reconcile ? [decision.userId] : [],
        skippedReason: null,
      };
      break;
  }

  try {
    return status(200, await mirror.processEvent(input));
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
    await queueReconciliationAfterFailure(mirror, input);
    return status(500, 'UNKNOWN');
  }
}

/**
 * RevenueCat stops after five retries. Queue an authoritative read for every
 * user the failed delivery named, so the mirror converges even if every retry
 * fails too. Best effort: if the database is unreachable this fails as well,
 * and the operator runbook covers recovery.
 */
async function queueReconciliationAfterFailure(
  mirror: RevenueCatMirror,
  input: ProcessEventInput,
): Promise<void> {
  const userIds = [
    ...new Set([...(input.userId ? [input.userId] : []), ...input.reconcileUserIds]),
  ];
  if (userIds.length === 0) return;
  try {
    const queued = await mirror.recordFailure(userIds);
    console.error(JSON.stringify({ code: 'REVENUECAT_WEBHOOK_FAILURE_QUEUED', queued }));
  } catch (error) {
    console.error(
      JSON.stringify({
        code: 'REVENUECAT_WEBHOOK_FAILURE_UNRECORDED',
        reason: error instanceof Error ? error.name : 'UNKNOWN',
      }),
    );
  }
}

function defaultConfig(): RevenueCatWebhookConfig {
  return {
    secret: Deno.env.get('REVENUECAT_WEBHOOK_SECRET'),
    environment: Deno.env.get('REVENUECAT_ENVIRONMENT'),
    signingSecret: Deno.env.get('REVENUECAT_WEBHOOK_SIGNING_SECRET'),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Only a recognised value is stored in the typed ledger column. */
function eventEnvironment(value: string | null | undefined): RevenueCatEnvironment | null {
  const parsed = revenueCatEnvironmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The ledger keeps the delivered event for diagnosis, minus developer-defined
 * subscriber attributes, which can hold personal data (email, name, phone).
 */
export function redactedPayload(envelope: RevenueCatWebhookEnvelope): unknown {
  const { subscriber_attributes: _removed, ...event } = envelope.event;
  return { api_version: envelope.api_version, event };
}

function status(code: number, result: string): Response {
  return new Response(JSON.stringify({ result }), {
    status: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
