import { assertEquals } from 'jsr:@std/assert@1';

import type { ReconcileConfigResult, Reconciler } from '../_shared/billing/reconciler.ts';
import type { ReconcileQueue } from '../_shared/billing/worker.ts';
import { CRON_SECRET_HEADER, handleReconcileCron } from './handler.ts';

const CONFIGURED: ReconcileConfigResult = {
  ok: true,
  config: { apiKey: 'sk', projectId: 'proj', environment: 'SANDBOX' },
};

function deps(overrides: { cronSecret?: string | undefined; config?: ReconcileConfigResult } = {}) {
  let touched = false;
  const queue: ReconcileQueue = {
    sweep: () => {
      touched = true;
      return Promise.resolve(0);
    },
    claim: () => Promise.resolve([]),
    release: () => Promise.resolve(),
  };
  const reconciler: Reconciler = {
    prepare: () => Promise.resolve({ ok: true, catalog: [] }),
    reconcile: () => Promise.resolve({ outcome: 'CONVERGED', retryAfterSeconds: null }),
  };
  return {
    value: {
      cronSecret: 'cron-secret',
      config: CONFIGURED,
      ...overrides,
      queue: () => queue,
      reconciler: () => reconciler,
    },
    touched: () => touched,
  };
}

function post(secret: string | null = 'cron-secret'): Request {
  const headers = new Headers();
  if (secret !== null) headers.set(CRON_SECRET_HEADER, secret);
  return new Request('https://example.test/revenuecat-reconcile', { method: 'POST', headers });
}

Deno.test('refuses to run without its own cron secret', async () => {
  const d = deps({ cronSecret: undefined });
  assertEquals((await handleReconcileCron(post(), d.value)).status, 503);
  assertEquals(d.touched(), false);
});

Deno.test('rejects a missing or wrong cron secret', async () => {
  for (const secret of [null, 'wrong']) {
    const d = deps();
    assertEquals((await handleReconcileCron(post(secret), d.value)).status, 403);
    assertEquals(d.touched(), false);
  }
});

Deno.test('refuses to drain without a read-only key, project, and environment', async () => {
  const d = deps({ config: { ok: false, missing: ['REVENUECAT_READONLY_API_KEY'] } });
  assertEquals((await handleReconcileCron(post(), d.value)).status, 503);
  assertEquals(d.touched(), false);
});

Deno.test('runs one bounded cycle and reports counts only', async () => {
  const d = deps();
  const response = await handleReconcileCron(post(), d.value);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { swept: 0, claimed: 0, outcomes: {} });
});

Deno.test('only POST is accepted', async () => {
  const d = deps();
  const response = await handleReconcileCron(
    new Request('https://example.test/revenuecat-reconcile', { method: 'GET' }),
    d.value,
  );
  assertEquals(response.status, 405);
});
