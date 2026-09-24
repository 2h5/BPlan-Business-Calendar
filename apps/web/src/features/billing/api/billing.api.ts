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

const accessRefreshSchema = z.object({
  status: z.enum([
    'REPAIRED',
    'CONVERGED',
    'STALE',
    'UNVERIFIED',
    'LEASE_LOST',
    'RETRY',
    'IN_PROGRESS',
    'RECENTLY_VERIFIED',
  ]),
});

export type AccessRefreshStatus = z.infer<typeof accessRefreshSchema>['status'];

/**
 * Ask the server to re-read the signed-in user's entitlement from RevenueCat
 * and repair the mirror if a webhook was lost. The server decides everything;
 * this call can never grant access by itself.
 */
export async function requestAccessRefresh(): Promise<AccessRefreshStatus> {
  const { data, error } = await supabase.functions.invoke<unknown>('revenuecat-refresh', {
    body: {},
  });
  if (error) throw toAppError(error);
  return accessRefreshSchema.parse(data).status;
}
