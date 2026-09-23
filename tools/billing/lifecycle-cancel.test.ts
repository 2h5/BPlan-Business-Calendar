import { describe, expect, it, vi } from 'vitest';

import type { LifecycleReport } from './lifecycle';
import { cancellationGuard, runSandboxCancellation } from './lifecycle-cancel';
import type { RevenueCatUserSnapshot } from './revenuecat-assertions';
import {
  cancelRevenueCatSandboxSubscriptionOnce,
  type RevenueCatCliInvocation,
} from './revenuecat-cli';
import type { SupabaseUserSnapshot } from './supabase-assertions';

const USER = '11111111-1111-4111-8111-111111111111';
const report: LifecycleReport = {
  ok: true,
  state: 'active',
  renewed: false,
  cancelled: false,
  providerPro: true,
  mirrorPro: true,
  serverPro: true,
  providerSubscriptionCount: 1,
  mirrorRowCount: 1,
  ledgerEventCount: 1,
  annualProductMatch: true,
  latestAppliedLedgerEventType: 'INITIAL_PURCHASE',
  storeIdentifier: 'bplan_pro_yearly',
  subscriptionStatus: 'active',
  givesAccess: true,
  subscriptionGrantsPro: true,
  periodStartsAt: '2026-09-22T00:00:00Z',
  periodEndsAt: '2026-09-22T01:00:00Z',
  endsAt: '2026-09-22T01:00:00Z',
  autoRenewalStatus: 'will_renew',
  ledgerTransitions: ['INITIAL_PURCHASE'],
  skippedLedgerEvents: 0,
  staleLedgerEvents: 0,
  duplicateLedgerEvents: 0,
};
const provider: RevenueCatUserSnapshot = {
  projectId: 'discovered-project',
  customerExists: true,
  customerId: USER,
  activePro: true,
  purchases: [],
  subscriptions: [
    {
      id: 'subscription',
      productId: 'product',
      storeIdentifier: 'bplan_pro_yearly',
      store: 'rc_billing',
      environment: 'sandbox',
      status: 'active',
      givesAccess: true,
      currentPeriodStartsAt: Date.parse('2026-09-22T00:00:00Z'),
      currentPeriodEndsAt: Date.parse('2026-09-22T01:00:00Z'),
      endsAt: Date.parse('2026-09-22T01:00:00Z'),
      autoRenewalStatus: 'will_renew',
      grantsPro: true,
    },
  ],
};
const supabase: SupabaseUserSnapshot = {
  mirrorRows: [
    {
      id: USER,
      user_id: USER,
      provider: 'revenuecat',
      entitlement: 'pro',
      status: 'active',
      expires_at: '2026-09-22T01:00:00.000Z',
      raw_customer_id: USER,
      last_event_at: '2026-09-22T00:00:00.000Z',
      updated_at: '2026-09-22T00:00:00.000Z',
    },
  ],
  activeMirror: true,
  ledgerRows: [
    {
      event_id: 'event',
      user_id: USER,
      event_type: 'INITIAL_PURCHASE',
      event_at: '2026-09-22T00:00:00.000Z',
      applied: true,
      skipped_reason: null,
      received_at: '2026-09-22T00:00:00.000Z',
    },
  ],
  ledgerCoherent: true,
  serverAuthorized: true,
};
const environment = {
  BILLING_AUTOMATION_MODE: 'sandbox-cancel',
  BILLING_AUTOMATION_ENV: 'sandbox',
  BILLING_TEST_USER_ID: USER,
  REVENUECAT_API_KEY: 'secret',
  BILLING_SUPABASE_URL: 'https://example.com',
  BILLING_SUPABASE_SERVICE_ROLE_KEY: 'secret',
};

describe('sandbox cancellation guards', () => {
  it('accepts only the exact renewing annual subscription and active authority chain', () => {
    expect(cancellationGuard(report, provider, USER)).toBeNull();
    expect(
      cancellationGuard(
        { ...report, renewed: true, ledgerTransitions: ['INITIAL_PURCHASE', 'RENEWAL'] },
        provider,
        USER,
      ),
    ).toBeNull();
    expect(cancellationGuard({ ...report, state: 'expired' }, provider, USER)).not.toBeNull();
    expect(cancellationGuard({ ...report, mirrorPro: false }, provider, USER)).not.toBeNull();
    expect(cancellationGuard(report, { ...provider, subscriptions: [] }, USER)).not.toBeNull();
    expect(
      cancellationGuard(
        report,
        { ...provider, subscriptions: [...provider.subscriptions, ...provider.subscriptions] },
        USER,
      ),
    ).not.toBeNull();
    expect(cancellationGuard(report, { ...provider, customerId: 'other' }, USER)).not.toBeNull();
    expect(
      cancellationGuard(
        report,
        {
          ...provider,
          subscriptions: [
            { ...provider.subscriptions[0]!, environment: 'production' as 'sandbox' },
          ],
        },
        USER,
      ),
    ).not.toBeNull();
    expect(
      cancellationGuard(
        report,
        {
          ...provider,
          subscriptions: [{ ...provider.subscriptions[0]!, storeIdentifier: 'bplan_pro_monthly' }],
        },
        USER,
      ),
    ).not.toBeNull();
    expect(
      cancellationGuard(
        report,
        {
          ...provider,
          subscriptions: [{ ...provider.subscriptions[0]!, autoRenewalStatus: 'will_not_renew' }],
        },
        USER,
      ),
    ).not.toBeNull();
  });

  it('rejects production and read-only modes before adapters or cancellation', async () => {
    const readProvider = vi.fn();
    const cancel = vi.fn();
    for (const [mode, target] of [
      ['sandbox-cancel', 'production'],
      ['live-readonly', 'sandbox'],
    ]) {
      expect(
        await runSandboxCancellation(
          {
            BILLING_AUTOMATION_MODE: mode,
            BILLING_AUTOMATION_ENV: target,
            BILLING_TEST_USER_ID: USER,
            REVENUECAT_API_KEY: 'secret',
            BILLING_SUPABASE_URL: 'https://example.com',
            BILLING_SUPABASE_SERVICE_ROLE_KEY: 'secret',
          },
          () => undefined,
          { readProvider, cancel },
        ),
      ).toBe(1);
    }
    expect(readProvider).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('constructs exactly one fixed cancellation invocation with no raw result output', async () => {
    const runner = vi.fn(async (_invocation: RevenueCatCliInvocation) => ({
      exitCode: 0,
      stdout: '{"ok":true}',
      stderr: '',
    }));
    const result = await cancelRevenueCatSandboxSubscriptionOnce(
      'project' as Parameters<typeof cancelRevenueCatSandboxSubscriptionOnce>[0],
      'subscription',
      { apiKey: 'secret', runner },
    );
    expect(result.ok).toBe(true);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[0].argv).toEqual([
      'subscriptions',
      'cancel',
      'subscription',
      '--yes',
      '--json',
      '--no-input',
      '--no-color',
      '--project-id',
      'project',
    ]);
  });

  it('submits once only after two stable provider reads and coherent mirror evidence', async () => {
    const readProvider = vi.fn(async () => ({ ok: true as const, data: provider }));
    const readSupabase = vi.fn(async () => ({ ok: true as const, data: supabase }));
    const cancel = vi.fn(async () => ({ ok: true as const }));
    const output: string[] = [];
    expect(
      await runSandboxCancellation(environment, (value) => output.push(value), {
        readProvider,
        readSupabase,
        cancel,
        now: () => new Date('2026-09-22T00:30:00Z'),
      }),
    ).toBe(0);
    expect(readProvider).toHaveBeenCalledTimes(2);
    expect(readSupabase).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(output.join('\n')).toContain('Submission: ONE');
    expect(output.join('\n')).not.toContain(USER);
  });

  it('aborts without submission if the subscription changes on the final provider read', async () => {
    const readProvider = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: provider })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          ...provider,
          subscriptions: [{ ...provider.subscriptions[0]!, autoRenewalStatus: 'will_not_renew' }],
        },
      });
    const cancel = vi.fn();
    expect(
      await runSandboxCancellation(environment, () => undefined, {
        readProvider,
        readSupabase: async () => ({ ok: true, data: supabase }),
        cancel,
        now: () => new Date('2026-09-22T00:30:00Z'),
      }),
    ).toBe(1);
    expect(cancel).not.toHaveBeenCalled();
  });
});
