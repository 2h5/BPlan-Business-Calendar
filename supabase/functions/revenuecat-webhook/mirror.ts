import { adminClient } from '../_shared/auth/index.ts';
import type { SubscriptionStatus } from '@cal/schemas/subscription';

/**
 * The mirror's write surface, as an interface so the handler can be tested
 * without a database. The Supabase implementation is the only place that
 * knows about tables or RPC names.
 */

export interface ApplyEntitlementInput {
  userId: string;
  entitlement: string;
  status: SubscriptionStatus;
  expiresAt: string | null;
  eventAt: string;
  customerId: string | null;
}

export interface LedgerEntry {
  eventId: string;
  userId: string | null;
  eventType: string;
  eventAt: string;
  applied: boolean;
  skippedReason: string | null;
  payload: unknown;
}

export interface RevenueCatMirror {
  /** Returns true when the mirror changed, false when the event was stale. */
  applyEntitlement(input: ApplyEntitlementInput): Promise<boolean>;
  /** Appends to the ledger. A repeat event id is a no-op, not an error. */
  recordEvent(entry: LedgerEntry): Promise<void>;
}

export function supabaseRevenueCatMirror(
  admin: ReturnType<typeof adminClient> = adminClient(),
): RevenueCatMirror {
  return {
    async applyEntitlement(input) {
      const { data, error } = await admin.rpc('apply_revenuecat_event', {
        p_user_id: input.userId,
        p_entitlement: input.entitlement,
        p_status: input.status,
        p_expires_at: input.expiresAt,
        p_event_at: input.eventAt,
        p_customer_id: input.customerId,
      });

      if (error) throw error;
      return data === true;
    },

    async recordEvent(entry) {
      const { error } = await admin.from('subscription_events').upsert(
        {
          event_id: entry.eventId,
          user_id: entry.userId,
          event_type: entry.eventType,
          event_at: entry.eventAt,
          applied: entry.applied,
          skipped_reason: entry.skippedReason,
          payload: entry.payload,
        },
        { onConflict: 'event_id', ignoreDuplicates: true },
      );

      if (error) throw error;
    },
  };
}
