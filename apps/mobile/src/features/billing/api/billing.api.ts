import { uuidSchema } from '@cal/schemas';
import { subscriptionSchema, type Subscription } from '@cal/schemas/subscription';
import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

const subscriptionRowSchema = z.object({
  entitlement: z.string().min(1),
  status: z.string().min(1),
  expires_at: z.string().nullable(),
});

/**
 * The account's Pro entitlement, or null when it has never had one.
 *
 * The row is a mirror of RevenueCat written by the webhook; the client may
 * only read it, so this is a display fact rather than the access decision —
 * the server still gates the AI features themselves.
 */
export async function fetchSubscription(userId: string): Promise<Subscription | null> {
  const parsedUserId = uuidSchema.parse(userId);
  const { data, error } = await supabase
    .from('subscriptions')
    .select('entitlement, status, expires_at')
    .eq('user_id', parsedUserId)
    .eq('entitlement', 'pro')
    .maybeSingle();

  if (error) throw toAppError(error);
  if (!data) return null;

  const row = subscriptionRowSchema.parse(data);
  return subscriptionSchema.parse({
    entitlement: row.entitlement,
    status: row.status,
    expiresAt: row.expires_at,
  });
}
