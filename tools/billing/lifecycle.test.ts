import { describe, expect, it } from 'vitest';

import { formatLifecycleReport, inspectAnnualLifecycle, inspectAnnualRenewal } from './lifecycle';
import {
  formatLifecycleReadOnlyFailure,
  formatLifecycleUnexpectedFailure,
  runBillingLifecycleReadOnly,
} from './lifecycle-command';
import {
  isStablePreRenewalWindow,
  runBillingAnnualRenewalReadOnly,
} from './lifecycle-renewal-command';
import type { RevenueCatUserSnapshot } from './revenuecat-assertions';
import {
  createSupabaseAssertionAdapter,
  type SubscriptionLedgerRow,
  type SupabaseUserSnapshot,
} from './supabase-assertions';

const START = Date.parse('2026-09-22T00:00:00Z');
const END = START + 60 * 60 * 1000;
const USER = '11111111-1111-4111-8111-111111111111';

function event(eventType: string, offsetMinutes: number, applied = true): SubscriptionLedgerRow {
  const eventAt = new Date(START + offsetMinutes * 60_000).toISOString();
  return {
    event_id: `event_${eventType}_${offsetMinutes}`,
    user_id: USER,
    event_type: eventType,
    event_at: eventAt,
    applied,
    skipped_reason: applied ? null : 'STALE_EVENT',
    received_at: eventAt,
  };
}

function fixtures(
  options: {
    now?: number;
    startsAt?: number;
    endsAt?: number;
    status?: string;
    givesAccess?: boolean;
    renewalStatus?: string | null;
    ledger?: SubscriptionLedgerRow[];
  } = {},
): { provider: RevenueCatUserSnapshot; supabase: SupabaseUserSnapshot; now: Date } {
  const startsAt = options.startsAt ?? START;
  const endsAt = options.endsAt ?? END;
  const active = options.givesAccess ?? true;
  const ledger = options.ledger ?? [event('INITIAL_PURCHASE', 0)];
  return {
    now: new Date(options.now ?? START + 30 * 60_000),
    provider: {
      projectId: 'project',
      customerExists: true,
      customerId: USER,
      activePro: active,
      subscriptions: [
        {
          id: 'subscription',
          productId: 'product',
          storeIdentifier: 'bplan_pro_yearly',
          store: 'rc_billing',
          environment: 'sandbox',
          status: options.status ?? 'active',
          givesAccess: active,
          currentPeriodStartsAt: startsAt,
          currentPeriodEndsAt: endsAt,
          endsAt,
          autoRenewalStatus:
            options.renewalStatus === undefined ? 'will_renew' : options.renewalStatus,
          grantsPro: active,
        },
      ],
      purchases: [],
    },
    supabase: {
      mirrorRows: [
        {
          id: USER,
          user_id: USER,
          provider: 'revenuecat',
          entitlement: 'pro',
          status: active ? 'active' : 'expired',
          expires_at: new Date(endsAt).toISOString(),
          raw_customer_id: USER,
          last_event_at: ledger.find((entry) => entry.applied)?.event_at ?? null,
          updated_at: new Date(START).toISOString(),
        },
      ],
      activeMirror: active,
      ledgerRows: ledger,
      ledgerCoherent: true,
      serverAuthorized: active,
    },
  };
}

describe('annual lifecycle read-only reconciliation', () => {
  it('accepts a coherent active annual period', () => {
    const result = inspectAnnualLifecycle(...values(fixtures()));
    expect(result).toMatchObject({ ok: true, state: 'active', renewed: false, cancelled: false });
  });

  it('keeps access after an observed cancellation until the paid period ends', () => {
    const result = inspectAnnualLifecycle(
      ...values(
        fixtures({
          renewalStatus: 'will_not_renew',
          ledger: [event('CANCELLATION', 20), event('INITIAL_PURCHASE', 0)],
        }),
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      state: 'cancelled-active',
      cancelled: true,
      providerPro: true,
      mirrorPro: true,
      serverPro: true,
    });
  });

  it('recognizes a renewed period with extended Pro access', () => {
    const result = inspectAnnualLifecycle(
      ...values(
        fixtures({
          now: END + 30 * 60_000,
          startsAt: END,
          endsAt: END + 60 * 60_000,
          ledger: [event('RENEWAL', 60), event('INITIAL_PURCHASE', 0)],
        }),
      ),
    );
    expect(result).toMatchObject({ ok: true, state: 'active', renewed: true, serverPro: true });
  });

  it('requires expiration to revoke Pro across all authorities', () => {
    const result = inspectAnnualLifecycle(
      ...values(
        fixtures({
          now: END + 60_000,
          status: 'expired',
          givesAccess: false,
          renewalStatus: 'will_not_renew',
          ledger: [
            event('EXPIRATION', 60),
            event('CANCELLATION', 20),
            event('INITIAL_PURCHASE', 0),
          ],
        }),
      ),
    );
    expect(result).toMatchObject({
      ok: true,
      state: 'expired',
      subscriptionStatus: 'expired',
      givesAccess: false,
      subscriptionGrantsPro: false,
      providerPro: false,
      mirrorPro: false,
      serverPro: false,
    });
  });

  it('rejects a mirror or server that disagrees with RevenueCat', () => {
    const fixture = fixtures();
    expect(
      inspectAnnualLifecycle(
        fixture.provider,
        { ...fixture.supabase, serverAuthorized: false },
        fixture.now,
      ),
    ).toMatchObject({ ok: false, failure: 'LIFECYCLE_AUTHORITY_MISMATCH' });
  });

  it('rejects duplicate ledger IDs and out-of-order rows via the ledger guard', () => {
    const fixture = fixtures({
      ledger: [event('INITIAL_PURCHASE', 0), event('INITIAL_PURCHASE', 0)],
    });
    expect(
      inspectAnnualLifecycle(
        fixture.provider,
        { ...fixture.supabase, ledgerCoherent: false },
        fixture.now,
      ),
    ).toMatchObject({ ok: false, failure: 'LIFECYCLE_LEDGER' });
  });

  it('does not let a stale expiration displace a newer renewal', () => {
    const fixture = fixtures({
      now: END + 30 * 60_000,
      startsAt: END,
      endsAt: END + 60 * 60_000,
      ledger: [event('RENEWAL', 60), event('EXPIRATION', 30, false), event('INITIAL_PURCHASE', 0)],
    });
    expect(inspectAnnualLifecycle(...values(fixture))).toMatchObject({
      ok: true,
      state: 'active',
      renewed: true,
      skippedLedgerEvents: 1,
      staleLedgerEvents: 1,
      duplicateLedgerEvents: 0,
    });
  });

  it('fails closed for missing period or renewal fields and contradictory provider access', () => {
    const fixture = fixtures({ renewalStatus: null });
    expect(inspectAnnualLifecycle(...values(fixture))).toMatchObject({
      ok: false,
      failure: 'LIFECYCLE_PROVIDER_MALFORMED',
    });
    const contradictory = fixtures({ status: 'expired', givesAccess: true });
    expect(inspectAnnualLifecycle(...values(contradictory))).toMatchObject({
      ok: false,
      failure: 'LIFECYCLE_PROVIDER_INCONSISTENT',
    });
  });

  it('requires a cancellation event before claiming cancelled-but-active', () => {
    const fixture = fixtures({ renewalStatus: 'will_not_renew' });
    expect(inspectAnnualLifecycle(...values(fixture))).toMatchObject({
      ok: false,
      failure: 'LIFECYCLE_CANCELLATION_UNPROVEN',
    });
    const uncancelled = fixtures({
      renewalStatus: 'will_not_renew',
      ledger: [
        event('UNCANCELLATION', 25),
        event('CANCELLATION', 20),
        event('INITIAL_PURCHASE', 0),
      ],
    });
    expect(inspectAnnualLifecycle(...values(uncancelled))).toMatchObject({
      ok: false,
      failure: 'LIFECYCLE_CANCELLATION_UNPROVEN',
    });
  });
});

describe('annual natural renewal comparison', () => {
  it('allows a short provider transition at the renewal boundary, then still bounds polling', () => {
    expect(isStablePreRenewalWindow(END - 2 * 60_000, END)).toBe(true);
    expect(isStablePreRenewalWindow(END - 30_000, END)).toBe(false);
    expect(isStablePreRenewalWindow(END + 30_000, END)).toBe(false);
  });
  function pair() {
    const initial = fixtures();
    const renewed = fixtures({
      now: END + 30 * 60_000,
      startsAt: END,
      endsAt: END + 60 * 60_000,
      ledger: [event('RENEWAL', 60), event('INITIAL_PURCHASE', 0)],
    });
    return { initial, renewed };
  }

  function compare(initial: ReturnType<typeof fixtures>, renewed: ReturnType<typeof fixtures>) {
    return inspectAnnualRenewal(
      initial.provider,
      initial.supabase,
      renewed.provider,
      renewed.supabase,
      initial.now,
      renewed.now,
    );
  }

  it('proves the same annual subscription extended and all authorities remained active', () => {
    const { initial, renewed } = pair();
    expect(compare(initial, renewed)).toMatchObject({
      ok: true,
      providerPro: true,
      mirrorPro: true,
      serverPro: true,
      ledgerTransitions: ['INITIAL_PURCHASE', 'RENEWAL'],
    });
  });

  it('accepts an audited stale delivery without letting it replace the renewal', () => {
    const { initial, renewed } = pair();
    const stale = event('EXPIRATION', 30, false);
    const ledger = [event('RENEWAL', 60), stale, event('INITIAL_PURCHASE', 0)];
    expect(
      compare(initial, {
        ...renewed,
        supabase: { ...renewed.supabase, ledgerRows: ledger },
      }),
    ).toMatchObject({
      ok: true,
      skippedLedgerEvents: 1,
      staleLedgerEvents: 1,
    });
  });

  it('rejects a different subscription, Product, project, or customer', () => {
    const { initial, renewed } = pair();
    for (const provider of [
      { ...renewed.provider, projectId: 'other' },
      { ...renewed.provider, customerId: 'other' },
      {
        ...renewed.provider,
        subscriptions: [{ ...renewed.provider.subscriptions[0]!, id: 'other' }],
      },
      {
        ...renewed.provider,
        subscriptions: [{ ...renewed.provider.subscriptions[0]!, productId: 'other' }],
      },
      {
        ...renewed.provider,
        subscriptions: [{ ...renewed.provider.subscriptions[0]!, productId: null }],
      },
    ]) {
      expect(compare(initial, { ...renewed, provider })).toMatchObject({
        ok: false,
        failure: 'RENEWAL_IDENTITY',
      });
    }
    expect(
      compare(initial, {
        ...renewed,
        supabase: {
          ...renewed.supabase,
          mirrorRows: [{ ...renewed.supabase.mirrorRows[0]!, raw_customer_id: 'other' }],
        },
      }),
    ).toMatchObject({ ok: false, failure: 'RENEWAL_IDENTITY' });
  });

  it('rejects a period that does not advance or a mirror that does not extend', () => {
    const { initial, renewed } = pair();
    const sub = renewed.provider.subscriptions[0]!;
    expect(
      compare(initial, {
        ...renewed,
        provider: {
          ...renewed.provider,
          subscriptions: [{ ...sub, currentPeriodStartsAt: START }],
        },
      }),
    ).toMatchObject({ ok: false, failure: 'RENEWAL_PERIOD' });
    expect(
      compare(initial, {
        ...renewed,
        supabase: {
          ...renewed.supabase,
          mirrorRows: [
            {
              ...renewed.supabase.mirrorRows[0]!,
              expires_at: new Date(END).toISOString(),
            },
          ],
        },
      }),
    ).toMatchObject({ ok: false });
  });

  it('rejects missing, stale, or extra applied renewal transitions', () => {
    const { initial, renewed } = pair();
    for (const ledger of [
      [event('INITIAL_PURCHASE', 0)],
      [event('RENEWAL', 60), event('RENEWAL', 40), event('INITIAL_PURCHASE', 0)],
      [event('RENEWAL', 60), event('CANCELLATION', 30), event('INITIAL_PURCHASE', 0)],
    ]) {
      expect(
        compare(initial, {
          ...renewed,
          supabase: {
            ...renewed.supabase,
            ledgerRows: ledger,
            mirrorRows: [
              {
                ...renewed.supabase.mirrorRows[0]!,
                last_event_at: ledger[0]!.event_at,
              },
            ],
          },
        }),
      ).toMatchObject({ ok: false, failure: 'RENEWAL_LEDGER' });
    }
  });

  it('rejects cancelled, inactive, malformed, or unauthorized renewal state', () => {
    const { initial, renewed } = pair();
    for (const changed of [
      {
        provider: {
          ...renewed.provider,
          subscriptions: [
            { ...renewed.provider.subscriptions[0]!, autoRenewalStatus: 'will_not_renew' },
          ],
        },
      },
      { provider: { ...renewed.provider, activePro: false } },
      { supabase: { ...renewed.supabase, serverAuthorized: false } },
    ]) {
      expect(compare(initial, { ...renewed, ...changed })).toMatchObject({ ok: false });
    }
  });
});

describe('annual lifecycle command safety', () => {
  it('puts lifecycle failure and safe structural diagnostics before detailed state', () => {
    const fixture = fixtures();
    const report = inspectAnnualLifecycle(
      fixture.provider,
      { ...fixture.supabase, serverAuthorized: false },
      fixture.now,
    );
    const lines = formatLifecycleReport(report).split('\n');

    expect(lines.slice(0, 7)).toEqual([
      'RevenueCat annual lifecycle (read-only)',
      'Result: FAIL',
      'Failure: LIFECYCLE_AUTHORITY_MISMATCH',
      'Provider subscriptions: 1',
      'Supabase mirror rows: 1',
      'Ledger events: 1',
      'Annual product match: YES',
    ]);
    expect(lines).toContain('Latest applied ledger event: INITIAL_PURCHASE');
    expect(formatLifecycleReport(report)).not.toContain(USER);
  });

  it('prints the failing RevenueCat operation without raw provider details', () => {
    const output = formatLifecycleReadOnlyFailure({
      category: 'REVENUECAT_PROJECT',
      code: 'CLI_GENERAL_ERROR',
      message: 'provider output must stay hidden',
      providerOperation: 'projects-list',
    });

    expect(output).toContain('Failure: CLI_GENERAL_ERROR');
    expect(output).toContain('RevenueCat operation: projects-list');
    expect(output).not.toContain('provider output');
  });

  it('uses a stable safe code when the CLI promise rejects unexpectedly', () => {
    expect(formatLifecycleUnexpectedFailure()).toBe(
      'RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: LIFECYCLE_UNEXPECTED',
    );
  });

  it('maps an unexpected RevenueCat read throw to a safe provider-stage code', async () => {
    const thrownValue = `provider exception ${USER} https://provider-secret.example/key`;
    const output: string[] = [];
    const result = await runBillingLifecycleReadOnly(
      lifecycleEnvironment(),
      (value) => output.push(value),
      {
        readProvider: async () => {
          throw new Error(thrownValue);
        },
      },
    );

    expect(result).toBe(1);
    expect(output).toEqual([
      'RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: LIFECYCLE_PROVIDER_UNEXPECTED',
    ]);
    expect(output.join('\n')).not.toContain(thrownValue);
    expect(output.join('\n')).not.toContain(USER);
    expect(output.join('\n')).not.toContain('https://');
  });

  it('maps an unexpected Supabase read throw to a safe Supabase-stage code', async () => {
    const thrownValue = `supabase exception ${USER} https://supabase-secret.example/service-role`;
    const fixture = fixtures();
    const output: string[] = [];
    const result = await runBillingLifecycleReadOnly(
      lifecycleEnvironment(),
      (value) => output.push(value),
      {
        readProvider: async () => ({ ok: true as const, data: fixture.provider }),
        readSupabase: async () => {
          throw new Error(thrownValue);
        },
      },
    );

    expect(result).toBe(1);
    expect(output).toEqual([
      'RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: LIFECYCLE_SUPABASE_UNEXPECTED',
    ]);
    expect(output.join('\n')).not.toContain(thrownValue);
    expect(output.join('\n')).not.toContain(USER);
    expect(output.join('\n')).not.toContain('https://');
  });

  it('prints the Supabase adapter sub-stage code without exposing transport details', async () => {
    const thrownValue = `mirror failure ${USER} service-role-secret https://secret.example/key`;
    const supabase = createSupabaseAssertionAdapter({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'service-role-secret',
      transport: {
        readSubscriptions: async () => {
          throw new Error(thrownValue);
        },
        readLedger: async () => ({ data: [], error: null }),
        readServerAuthorization: async () => ({ data: false, error: null }),
      },
    });
    const fixture = fixtures();
    const output: string[] = [];

    const result = await runBillingLifecycleReadOnly(
      lifecycleEnvironment(),
      (value) => output.push(value),
      {
        readProvider: async () => ({ ok: true as const, data: fixture.provider }),
        readSupabase: supabase.readUser,
      },
    );

    expect(result).toBe(1);
    expect(output).toEqual([
      'RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: SUPABASE_MIRROR_UNEXPECTED',
    ]);
    expect(output.join('\n')).not.toContain(thrownValue);
    expect(output.join('\n')).not.toContain(USER);
    expect(output.join('\n')).not.toContain('service-role-secret');
    expect(output.join('\n')).not.toContain('https://');
  });

  it('maps unexpected reconciliation and formatting throws to the reconciliation-stage code', async () => {
    const fixture = fixtures();
    const thrownValue = `reconciliation exception ${USER} https://reconciliation-secret.example/raw`;
    const output: string[] = [];
    const reconciliationResult = await runBillingLifecycleReadOnly(
      lifecycleEnvironment(),
      (value) => output.push(value),
      {
        readProvider: async () => ({ ok: true as const, data: fixture.provider }),
        readSupabase: async () => ({ ok: true as const, data: fixture.supabase }),
        inspect: () => {
          throw new Error(thrownValue);
        },
      },
    );

    expect(reconciliationResult).toBe(1);
    expect(output).toEqual([
      'RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: LIFECYCLE_RECONCILIATION_UNEXPECTED',
    ]);
    expect(output.join('\n')).not.toContain(thrownValue);
    expect(output.join('\n')).not.toContain(USER);
    expect(output.join('\n')).not.toContain('https://');

    output.length = 0;
    const formattingResult = await runBillingLifecycleReadOnly(
      lifecycleEnvironment(),
      (value) => output.push(value),
      {
        readProvider: async () => ({ ok: true as const, data: fixture.provider }),
        readSupabase: async () => ({ ok: true as const, data: fixture.supabase }),
        formatReport: () => {
          throw new Error(thrownValue);
        },
      },
    );

    expect(formattingResult).toBe(1);
    expect(output).toEqual([
      'RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: LIFECYCLE_RECONCILIATION_UNEXPECTED',
    ]);
    expect(output.join('\n')).not.toContain(thrownValue);
    expect(output.join('\n')).not.toContain(USER);
    expect(output.join('\n')).not.toContain('https://');
  });

  it('rejects production and mutating modes before creating any adapter', async () => {
    const base = {
      BILLING_TEST_USER_ID: USER,
      REVENUECAT_API_KEY: 'fake-key',
      BILLING_SUPABASE_URL: 'https://example.supabase.co',
      BILLING_SUPABASE_SERVICE_ROLE_KEY: 'fake-role-key',
    };
    for (const environment of [
      { ...base, BILLING_AUTOMATION_MODE: 'live-readonly', BILLING_AUTOMATION_ENV: 'production' },
      { ...base, BILLING_AUTOMATION_MODE: 'sandbox-purchase', BILLING_AUTOMATION_ENV: 'sandbox' },
    ]) {
      const output: string[] = [];
      expect(await runBillingLifecycleReadOnly(environment, (value) => output.push(value))).toBe(1);
      expect(output.join('\n')).toContain('Failure: CONFIGURATION');
    }
  });

  it('keeps the renewal observer read-only and sandbox-only', async () => {
    const base = {
      BILLING_TEST_USER_ID: USER,
      REVENUECAT_API_KEY: 'fake-key',
      BILLING_SUPABASE_URL: 'https://example.supabase.co',
      BILLING_SUPABASE_SERVICE_ROLE_KEY: 'fake-role-key',
    };
    for (const environment of [
      { ...base, BILLING_AUTOMATION_MODE: 'live-readonly', BILLING_AUTOMATION_ENV: 'production' },
      { ...base, BILLING_AUTOMATION_MODE: 'sandbox-purchase', BILLING_AUTOMATION_ENV: 'sandbox' },
    ]) {
      const output: string[] = [];
      expect(
        await runBillingAnnualRenewalReadOnly(environment, (value) => output.push(value)),
      ).toBe(1);
      expect(output.join('\n')).toContain('Failure: CONFIGURATION');
    }
  });
});

function lifecycleEnvironment() {
  return {
    BILLING_AUTOMATION_MODE: 'live-readonly',
    BILLING_AUTOMATION_ENV: 'sandbox',
    BILLING_TEST_USER_ID: USER,
    REVENUECAT_API_KEY: 'test-api-key',
    BILLING_SUPABASE_URL: 'https://example.supabase.co',
    BILLING_SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
}

function values(
  fixture: ReturnType<typeof fixtures>,
): [RevenueCatUserSnapshot, SupabaseUserSnapshot, Date] {
  return [fixture.provider, fixture.supabase, fixture.now];
}
