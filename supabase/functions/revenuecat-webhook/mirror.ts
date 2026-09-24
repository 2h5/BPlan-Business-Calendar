import { adminClient } from '../_shared/auth/index.ts';
import type { RevenueCatEnvironment } from '@cal/schemas/subscription';

export type EventOutcome = 'APPLIED' | 'STALE' | 'DEFERRED' | 'IGNORED' | 'DUPLICATE';

export interface ProcessEventInput {
  eventId: string;
  eventType: string;
  eventAt: string;
  /** The event's own environment after enforcement; null when it named none. */
  environment: RevenueCatEnvironment | null;
  decision: 'apply' | 'reconcile' | 'ignore';
  appUserId: string | null;
  userId: string | null;
  status: 'active' | 'expired' | null;
  expiresAt: string | null;
  customerId: string | null;
  entitlements: string[];
  reconcileUserIds: string[];
  skippedReason: string | null;
  payload: unknown;
}

export interface RevenueCatMirror {
  /** Claims the event ID, applies or defers the decision, and records one outcome. */
  processEvent(input: ProcessEventInput): Promise<EventOutcome>;
  /** After processEvent failed: queue reconciliation for the named users. Returns how many exist. */
  recordFailure(userIds: string[]): Promise<number>;
}

const OUTCOMES: readonly EventOutcome[] = ['APPLIED', 'STALE', 'DEFERRED', 'IGNORED', 'DUPLICATE'];

export function supabaseRevenueCatMirror(
  admin: ReturnType<typeof adminClient> = adminClient(),
): RevenueCatMirror {
  return {
    async processEvent(input) {
      const { data, error } = await admin.rpc('process_revenuecat_event', {
        p_event_id: input.eventId,
        p_event_type: input.eventType,
        p_event_at: input.eventAt,
        p_environment: input.environment,
        p_decision: input.decision,
        p_app_user_id: input.appUserId,
        p_user_id: input.userId,
        p_status: input.status,
        p_expires_at: input.expiresAt,
        p_customer_id: input.customerId,
        p_entitlements: input.entitlements,
        p_reconcile_user_ids: input.reconcileUserIds,
        p_skipped_reason: input.skippedReason,
        p_payload: input.payload,
      });

      if (error) throw error;
      if (typeof data === 'string' && (OUTCOMES as readonly string[]).includes(data)) {
        return data as EventOutcome;
      }
      throw new Error('Unexpected RevenueCat database outcome');
    },

    async recordFailure(userIds) {
      const { data, error } = await admin.rpc('record_revenuecat_webhook_failure', {
        p_user_ids: userIds,
      });
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
  };
}
