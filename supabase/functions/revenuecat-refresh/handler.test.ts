import { assertEquals } from 'jsr:@std/assert@1';

import { EdgeError } from '../_shared/errors/index.ts';
import type { ReconcileConfigResult } from '../_shared/billing/reconciler.ts';
import { createRefreshHandler, type RefreshClaim } from './handler.ts';

const USER = '0f8b3a52-6c1e-4b8e-9a51-2d7c4e9f1a01';
const CONFIGURED: ReconcileConfigResult = {
  ok: true,
  config: { apiKey: 'sk', projectId: 'proj', environment: 'SANDBOX' },
};

function handler(
  options: { claim?: RefreshClaim; config?: ReconcileConfigResult; signedIn?: boolean } = {},
) {
  const calls: { claimedFor: string[]; reconciled: string[] } = { claimedFor: [], reconciled: [] };
  const handle = createRefreshHandler({
    requireUser: () =>
      options.signedIn === false
        ? Promise.reject(new EdgeError('NOT_AUTHENTICATED', 'Sign in required.', 401))
        : Promise.resolve({ id: USER }),
    config: options.config ?? CONFIGURED,
    claim: (userId) => {
      calls.claimedFor.push(userId);
      return Promise.resolve(options.claim ?? { status: 'CLAIMED', leaseToken: 'lease' });
    },
    reconciler: () => ({
      reconcile: (userId, lease) => {
        calls.reconciled.push(`${userId}:${lease}`);
        return Promise.resolve('REPAIRED');
      },
    }),
  });
  return { handle, calls };
}

const post = () => new Request('https://example.test/revenuecat-refresh', { method: 'POST' });

Deno.test('requires a signed-in user and targets only that user', async () => {
  const anonymous = handler({ signedIn: false });
  assertEquals((await anonymous.handle(post())).status, 401);
  assertEquals(anonymous.calls.claimedFor, []);

  const signedIn = handler();
  const response = await signedIn.handle(post());
  assertEquals(await response.json(), { status: 'REPAIRED' });
  assertEquals(signedIn.calls.claimedFor, [USER]);
  assertEquals(signedIn.calls.reconciled, [`${USER}:lease`]);
});

Deno.test('rate limiting and an in-flight lease return without reading RevenueCat', async () => {
  for (const status of ['RECENTLY_VERIFIED', 'IN_PROGRESS'] as const) {
    const { handle, calls } = handler({ claim: { status, leaseToken: null } });
    assertEquals(await (await handle(post())).json(), { status });
    assertEquals(calls.reconciled, []);
  }
});

Deno.test('an unconfigured deployment refuses before claiming', async () => {
  const { handle, calls } = handler({ config: { ok: false, missing: ['REVENUECAT_PROJECT_ID'] } });
  assertEquals((await handle(post())).status, 503);
  assertEquals(calls.claimedFor, []);
});

Deno.test('answers CORS preflight', async () => {
  const { handle } = handler();
  const response = await handle(
    new Request('https://example.test/revenuecat-refresh', { method: 'OPTIONS' }),
  );
  assertEquals(response.status, 200);
});
