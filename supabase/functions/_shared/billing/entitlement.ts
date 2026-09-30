import { EdgeError } from '../errors/index.ts';

/** The one database call the gate needs; a service-role client satisfies it. */
export interface EntitlementRpc {
  rpc(
    fn: 'has_active_entitlement',
    args: { p_user_id: string; p_entitlement: string },
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Server-side Pro gate for paid Edge Functions.
 *
 * Only the verified user id crosses into the check: the answer comes from the
 * subscription mirror, never from anything the client sent. Anything other
 * than an explicit `true` is a denial, so an unexpected RPC shape fails closed.
 */
export async function requireProEntitlement(
  client: EntitlementRpc,
  userId: string,
  deniedMessage: string,
): Promise<void> {
  const { data, error } = await client.rpc('has_active_entitlement', {
    p_user_id: userId,
    p_entitlement: 'pro',
  });
  if (error) {
    throw new EdgeError('UNKNOWN', 'Could not verify your subscription.', 500);
  }
  if (data !== true) {
    throw new EdgeError('SUBSCRIPTION_REQUIRED', deniedMessage, 403);
  }
}
