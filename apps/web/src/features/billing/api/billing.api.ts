import { subscriptionSchema, type Subscription } from '@cal/schemas/subscription';
import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

const subscriptionRowSchema = z.object({
  entitlement: z.string().min(1),
  status: z.string().min(1),
  expires_at: z.string().nullable(),
});

export async function fetchSubscription(): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('entitlement, status, expires_at')
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
