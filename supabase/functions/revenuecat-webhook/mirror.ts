import { adminClient } from '../_shared/auth/index.ts';
import type { SubscriptionStatus } from '@cal/schemas/subscription';

export type EventOutcome = 'APPLIED' | 'STALE' | 'IGNORED' | 'DUPLICATE';

export interface ProcessEventInput {
  eventId: string;
  userId: string | null;
  eventType: string;
  eventAt: string;
  status: SubscriptionStatus | null;
  expiresAt: string | null;
  customerId: string | null;
  entitlements: string[];
  revokeFrom: string[];
  skippedReason: string | null;
  payload: unknown;
}

export interface RevenueCatMirror {
  /** Claims the event ID, applies ordered mirror changes, and records one outcome. */
  processEvent(input: ProcessEventInput): Promise<EventOutcome>;
}

export function supabaseRevenueCatMirror(
  admin: ReturnType<typeof adminClient> = adminClient(),
): RevenueCatMirror {
  return {
    async processEvent(input) {
      const { data, error } = await admin.rpc('process_revenuecat_event', {
        p_event_id: input.eventId,
        p_user_id: input.userId,
        p_event_type: input.eventType,
        p_event_at: input.eventAt,
        p_status: input.status,
        p_expires_at: input.expiresAt,
        p_customer_id: input.customerId,
        p_entitlements: input.entitlements,
        p_revoke_from: input.revokeFrom,
        p_skipped_reason: input.skippedReason,
        p_payload: input.payload,
      });

      if (error) throw error;
      if (data === 'APPLIED' || data === 'STALE' || data === 'IGNORED' || data === 'DUPLICATE') {
        return data;
      }
      throw new Error('Unexpected RevenueCat database outcome');
    },
  };
}
