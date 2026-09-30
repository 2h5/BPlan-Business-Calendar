import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { EdgeError } from '../errors/index.ts';
import { type EntitlementRpc, requireProEntitlement } from './entitlement.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function rpcReturning(result: { data: unknown; error: unknown }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client: EntitlementRpc = {
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
  return { client, calls };
}

Deno.test('an active Pro entitlement passes and asks only about the verified user', async () => {
  const { client, calls } = rpcReturning({ data: true, error: null });

  await requireProEntitlement(client, USER_ID, 'Find Time requires Pro.');

  assertEquals(calls, [
    { fn: 'has_active_entitlement', args: { p_user_id: USER_ID, p_entitlement: 'pro' } },
  ]);
});

Deno.test('a free or expired user is refused with SUBSCRIPTION_REQUIRED', async () => {
  const { client } = rpcReturning({ data: false, error: null });

  const error = await assertRejects(
    () => requireProEntitlement(client, USER_ID, 'Find Time requires Pro.'),
    EdgeError,
  );
  assertEquals(
    [error.code, error.status, error.message],
    ['SUBSCRIPTION_REQUIRED', 403, 'Find Time requires Pro.'],
  );
});

Deno.test('anything other than an explicit true fails closed', async () => {
  for (const data of [null, undefined, 'true', 1, {}, [true]]) {
    const { client } = rpcReturning({ data, error: null });
    const error = await assertRejects(
      () => requireProEntitlement(client, USER_ID, 'Requires Pro.'),
      EdgeError,
    );
    assertEquals(error.code, 'SUBSCRIPTION_REQUIRED');
  }
});

Deno.test('a failed entitlement lookup is a server error, never a grant', async () => {
  const { client } = rpcReturning({ data: true, error: { message: 'connection reset' } });

  const error = await assertRejects(
    () => requireProEntitlement(client, USER_ID, 'Requires Pro.'),
    EdgeError,
  );
  assertEquals([error.code, error.status], ['UNKNOWN', 500]);
});
