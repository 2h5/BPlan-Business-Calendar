import { describe, expect, it, vi } from 'vitest';

import {
  formatBillingAssertUserReport,
  parseBillingAssertUserArguments,
  runBillingAssertUser,
} from './assert-user';
import { runBillingAssertUserCommand } from './assert-user-command';
import type { BillingAssertionResult } from './assertion-types';
import {
  createRevenueCatAssertionAdapter,
  type RevenueCatAssertionAdapter,
  type RevenueCatSubscriptionEvidence,
  type RevenueCatUserSnapshot,
} from './revenuecat-assertions';
import type { RevenueCatCliInvocation, RevenueCatCliRunner } from './revenuecat-cli';
import type { SupabaseAssertionAdapter, SupabaseUserSnapshot } from './supabase-assertions';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-09-18T12:00:00.000Z');
const API_KEY = 'revenuecat-secret-sentinel';
const SERVICE_KEY = 'supabase-secret-sentinel';
const LIVE_ENV = {
  BILLING_AUTOMATION_MODE: 'live-readonly',
  BILLING_AUTOMATION_ENV: 'sandbox',
  REVENUECAT_API_KEY: API_KEY,
  BILLING_SUPABASE_URL: 'https://example.supabase.co',
  BILLING_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
} as const;

function entitlementList() {
  return { items: [{ id: 'entl_pro', lookup_key: 'pro' }], next_page: null };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_sandbox_1',
    customer_id: USER_ID,
    original_customer_id: USER_ID,
    product_id: 'prod_monthly',
    store: 'rc_billing',
    environment: 'sandbox',
    status: 'active',
    gives_access: true,
    current_period_starts_at: NOW.getTime(),
    current_period_ends_at: NOW.getTime() + 86_400_000,
    ends_at: NOW.getTime() + 86_400_000,
    auto_renewal_status: 'will_renew',
    entitlements: entitlementList(),
    ...overrides,
  };
}

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'purch_sandbox_1',
    customer_id: USER_ID,
    original_customer_id: USER_ID,
    product_id: 'prod_lifetime',
    store: 'rc_billing',
    environment: 'sandbox',
    status: 'owned',
    purchased_at: NOW.getTime() - 86_400_000,
    entitlements: entitlementList(),
    ...overrides,
  };
}

function customerProfile(
  options: {
    active?: boolean;
    subscriptions?: readonly Record<string, unknown>[];
    purchases?: readonly Record<string, unknown>[];
  } = {},
) {
  return {
    data: {
      customer: {
        id: USER_ID,
        project_id: 'proj_bplan',
        active_entitlements: {
          items:
            options.active === false
              ? []
              : [{ entitlement_id: 'entl_pro', expires_at: NOW.getTime() + 86_400_000 }],
          next_page: null,
        },
      },
      subscriptions: { items: options.subscriptions ?? [subscription()], next_page: null },
      purchases: { items: options.purchases ?? [], next_page: null },
    },
    schema_version: 1,
  };
}

function providerRunner(
  options: {
    customer?: unknown;
    entitlements?: unknown;
    subscription?: unknown | ((id: string) => unknown);
    purchase?: unknown;
    product?: unknown | ((id: string) => unknown);
    productExitCode?: number;
    customerNotFound?: boolean;
    projects?: unknown;
    projectsExitCode?: number;
  } = {},
): { runner: RevenueCatCliRunner; invocations: RevenueCatCliInvocation[] } {
  const invocations: RevenueCatCliInvocation[] = [];
  const runner: RevenueCatCliRunner = async (invocation) => {
    invocations.push(invocation);
    const command = invocation.argv.slice(0, 2).join(' ');
    let payload: unknown;
    if (invocation.argv[0] === 'version')
      payload = { data: { version: '0.1.1' }, schema_version: 1 };
    else if (command === 'projects list') {
      if (options.projectsExitCode !== undefined) {
        return {
          exitCode: options.projectsExitCode,
          stdout: '{"providerPayload":"must stay hidden"}',
          stderr: 'provider diagnostics must stay hidden',
        };
      }
      payload = options.projects ?? {
        data: { items: [{ id: 'proj_bplan', name: 'BPlan: Business Calendar' }] },
      };
    } else if (command === 'entitlements list') {
      payload = options.entitlements ?? { data: entitlementList() };
    } else if (command === 'customers show') {
      if (options.customerNotFound) {
        return { exitCode: 5, stdout: '', stderr: 'raw provider output' };
      }
      payload = options.customer ?? customerProfile();
    } else if (command === 'subscriptions show') {
      payload =
        typeof options.subscription === 'function'
          ? options.subscription(invocation.argv[2] ?? '')
          : (options.subscription ?? { data: subscription(), schema_version: 1 });
    } else if (command === 'purchases show') {
      payload = options.purchase ?? { data: purchase(), schema_version: 1 };
    } else if (command === 'products show') {
      if (options.productExitCode !== undefined) {
        return { exitCode: options.productExitCode, stdout: '', stderr: 'redacted' };
      }
      const id = invocation.argv[2];
      payload =
        typeof options.product === 'function'
          ? options.product(id ?? '')
          : (options.product ?? {
              data: {
                id,
                object: 'product',
                store_identifier: id === 'prod_lifetime' ? 'lifetime' : 'bplan_pro_monthly',
              },
            });
    } else {
      throw new Error(`Unexpected fake command ${command}`);
    }
    return { exitCode: 0, stdout: JSON.stringify(payload), stderr: '' };
  };
  return { runner, invocations };
}

function providerAdapter(options: Parameters<typeof providerRunner>[0] = {}) {
  const fake = providerRunner(options);
  return {
    adapter: createRevenueCatAssertionAdapter({
      apiKey: API_KEY,
      runner: fake.runner,
      now: () => NOW,
    }),
    invocations: fake.invocations,
  };
}

function activeProvider(overrides: Partial<RevenueCatUserSnapshot> = {}): RevenueCatUserSnapshot {
  return {
    projectId: 'proj_bplan',
    customerExists: true,
    customerId: USER_ID,
    activePro: true,
    subscriptions: [
      {
        id: 'sub_1',
        productId: 'prod_monthly',
        storeIdentifier: 'bplan_pro_monthly',
        store: 'rc_billing',
        environment: 'sandbox',
        status: 'active',
        givesAccess: true,
        currentPeriodStartsAt: NOW.getTime(),
        currentPeriodEndsAt: NOW.getTime() + 86_400_000,
        endsAt: NOW.getTime() + 86_400_000,
        autoRenewalStatus: 'will_renew',
        grantsPro: true,
      },
    ],
    purchases: [],
    ...overrides,
  };
}

function planSubscription(
  plan: 'monthly' | 'annual',
  id: string,
  overrides: Partial<RevenueCatSubscriptionEvidence> = {},
): RevenueCatSubscriptionEvidence {
  return {
    ...activeProvider().subscriptions[0]!,
    id,
    productId: plan === 'monthly' ? 'prod_monthly' : 'prod_annual',
    storeIdentifier: plan === 'monthly' ? 'bplan_pro_monthly' : 'bplan_pro_yearly',
    ...overrides,
  };
}

function activeSupabase(overrides: Partial<SupabaseUserSnapshot> = {}): SupabaseUserSnapshot {
  return {
    mirrorRows: [],
    activeMirror: true,
    ledgerRows: [
      {
        event_id: 'evt_1',
        user_id: USER_ID,
        event_type: 'INITIAL_PURCHASE',
        event_at: '2026-09-17T12:00:00.000Z',
        applied: true,
        skipped_reason: null,
        received_at: '2026-09-17T12:00:01.000Z',
      },
    ],
    ledgerCoherent: true,
    serverAuthorized: true,
    ...overrides,
  };
}

function fixedAdapter<T>(result: BillingAssertionResult<T>) {
  return { readUser: vi.fn().mockResolvedValue(result) };
}

async function runWithSnapshots(
  provider: RevenueCatUserSnapshot,
  supabase: SupabaseUserSnapshot,
  argv: readonly string[] = ['--user', USER_ID],
  expectedPlan?: 'monthly' | 'annual',
) {
  return runBillingAssertUser({
    environment: LIVE_ENV,
    argv,
    revenueCat: fixedAdapter({ ok: true, data: provider }) as RevenueCatAssertionAdapter,
    supabase: fixedAdapter({ ok: true, data: supabase }) as SupabaseAssertionAdapter,
    now: () => NOW,
    expectedPlan,
  });
}

describe('billing:assert-user input and safety', () => {
  it('accepts a UUID, rejects malformed or missing IDs, and lets CLI input win', () => {
    expect(parseBillingAssertUserArguments(['--user', USER_ID], {})).toMatchObject({
      ok: true,
      data: { userId: USER_ID },
    });
    expect(parseBillingAssertUserArguments(['--user', 'person@example.com'], {})).toMatchObject({
      ok: false,
      error: { code: 'USER_ID_INVALID' },
    });
    expect(parseBillingAssertUserArguments([], {})).toMatchObject({
      ok: false,
      error: { code: 'USER_ID_MISSING' },
    });
    expect(
      parseBillingAssertUserArguments(['--user', USER_ID], {
        BILLING_TEST_USER_ID: 'bad-environment-value',
      }),
    ).toMatchObject({ ok: true, data: { userId: USER_ID } });
  });

  it.each([
    [['--user', USER_ID, '--expect', 'active-pro', '--plan', 'invalid'], 'PLAN_INVALID'],
    [['--user', USER_ID, '--expect', 'active-pro', '--plan'], 'PLAN_MISSING'],
    [
      ['--user', USER_ID, '--expect', 'active-pro', '--plan', '--expect', 'active-pro'],
      'PLAN_MISSING',
    ],
    [
      ['--user', USER_ID, '--expect', 'active-pro', '--plan', 'annual', '--plan', 'monthly'],
      'PLAN_DUPLICATE',
    ],
    [['--user', USER_ID, '--expect', 'free', '--plan', 'annual'], 'PLAN_NOT_ALLOWED_FOR_FREE'],
  ] as const)('rejects invalid plan arguments with stable code', (argv, code) => {
    expect(parseBillingAssertUserArguments(argv, {})).toMatchObject({
      ok: false,
      error: { code },
    });
  });

  it('parses monthly and annual plan scopes while preserving the unscoped default', () => {
    expect(
      parseBillingAssertUserArguments(
        ['--user', USER_ID, '--expect', 'active-pro', '--plan', 'monthly'],
        {},
      ),
    ).toMatchObject({ ok: true, data: { expectedState: 'active-pro', expectedPlan: 'monthly' } });
    expect(
      parseBillingAssertUserArguments(
        ['--user', USER_ID, '--expect', 'active-pro', '--plan', 'annual'],
        {},
      ),
    ).toMatchObject({ ok: true, data: { expectedState: 'active-pro', expectedPlan: 'annual' } });
    expect(parseBillingAssertUserArguments(['--user', USER_ID], {})).toMatchObject({
      ok: true,
      data: { expectedState: 'active-pro', expectedPlan: undefined },
    });
  });

  it.each([
    [{ ...LIVE_ENV, BILLING_AUTOMATION_MODE: 'offline' }, 'LIVE_READONLY_REQUIRED'],
    [{ ...LIVE_ENV, BILLING_AUTOMATION_MODE: 'sandbox-purchase' }, 'LIVE_READONLY_REQUIRED'],
    [{ ...LIVE_ENV, BILLING_AUTOMATION_ENV: 'production' }, 'SANDBOX_REQUIRED'],
    [{ ...LIVE_ENV, REVENUECAT_API_KEY: '' }, 'CONFIGURATION_INVALID'],
    [{ ...LIVE_ENV, BILLING_SUPABASE_URL: '' }, 'CONFIGURATION_INVALID'],
    [{ ...LIVE_ENV, BILLING_SUPABASE_SERVICE_ROLE_KEY: '' }, 'CONFIGURATION_INVALID'],
  ])('rejects unsafe configuration before either adapter runs', async (environment, code) => {
    const revenueCat = fixedAdapter({ ok: true, data: activeProvider() });
    const supabase = fixedAdapter({ ok: true, data: activeSupabase() });
    const report = await runBillingAssertUser({
      environment,
      argv: ['--user', USER_ID],
      revenueCat: revenueCat as RevenueCatAssertionAdapter,
      supabase: supabase as SupabaseAssertionAdapter,
    });

    expect(report).toMatchObject({ ok: false, failure: { code } });
    expect(revenueCat.readUser).not.toHaveBeenCalled();
    expect(supabase.readUser).not.toHaveBeenCalled();
  });

  it('never prints configured secrets or raw provider diagnostics', async () => {
    const report = await runBillingAssertUser({
      environment: LIVE_ENV,
      argv: ['--user', USER_ID],
      revenueCat: fixedAdapter({
        ok: false,
        error: {
          category: 'REVENUECAT_CUSTOMER',
          code: 'FAKE_ERROR',
          message: `provider failed ${API_KEY} ${SERVICE_KEY}`,
        },
      }) as RevenueCatAssertionAdapter,
      supabase: fixedAdapter({ ok: true, data: activeSupabase() }) as SupabaseAssertionAdapter,
    });
    const output = formatBillingAssertUserReport(report);

    expect(output).not.toContain(API_KEY);
    expect(output).not.toContain(SERVICE_KEY);
  });
});

describe('RevenueCat user assertion adapter', () => {
  it('discovers the exact project and reads an active Pro sandbox subscription', async () => {
    const fake = providerAdapter();
    const result = await fake.adapter.readUser(USER_ID);

    expect(result).toMatchObject({
      ok: true,
      data: { customerExists: true, activePro: true, projectId: 'proj_bplan' },
    });
    expect(fake.invocations.map((item) => item.argv.slice(0, 2).join(' '))).toEqual([
      'version --json',
      'projects list',
      'entitlements list',
      'customers show',
      'subscriptions show',
      'products show',
    ]);
  });

  it('preserves safe operation context for generic CLI failures without provider output', async () => {
    const result = await providerAdapter({ projectsExitCode: 1 }).adapter.readUser(USER_ID);

    expect(result).toMatchObject({
      ok: false,
      error: {
        category: 'REVENUECAT_PROJECT',
        code: 'CLI_GENERAL_ERROR',
        providerOperation: 'projects-list',
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(USER_ID);
    expect(serialized).not.toContain('provider diagnostics');
    expect(serialized).not.toContain('must stay hidden');
  });

  it('represents an absent customer distinctly', async () => {
    const result = await providerAdapter({ customerNotFound: true }).adapter.readUser(USER_ID);
    expect(result).toMatchObject({
      ok: true,
      data: { customerExists: false, activePro: false, subscriptions: [], purchases: [] },
    });
  });

  it('represents no Pro and expired Pro as inactive', async () => {
    const noPro = await providerAdapter({
      customer: customerProfile({ active: false, subscriptions: [], purchases: [] }),
    }).adapter.readUser(USER_ID);
    const expired = await providerAdapter({
      customer: {
        ...customerProfile({ subscriptions: [], purchases: [] }),
        data: {
          ...customerProfile({ subscriptions: [], purchases: [] }).data,
          customer: {
            ...customerProfile().data.customer,
            active_entitlements: {
              items: [{ entitlement_id: 'entl_pro', expires_at: NOW.getTime() - 1 }],
              next_page: null,
            },
          },
        },
      },
    }).adapter.readUser(USER_ID);

    expect(noPro).toMatchObject({ ok: true, data: { activePro: false } });
    expect(expired).toMatchObject({ ok: true, data: { activePro: false } });
  });

  it('follows relevant purchase resources and reduces owned sandbox evidence', async () => {
    const value = purchase();
    const result = await providerAdapter({
      customer: customerProfile({ subscriptions: [], purchases: [value] }),
      purchase: { data: value, schema_version: 1 },
    }).adapter.readUser(USER_ID);

    expect(result).toMatchObject({
      ok: true,
      data: { purchases: [{ status: 'owned', grantsPro: true, environment: 'sandbox' }] },
    });
  });

  it('resolves an internal annual Product ID to its canonical store identifier', async () => {
    const annual = subscription({ product_id: 'prod_annual' });
    const fake = providerAdapter({
      customer: customerProfile({ subscriptions: [annual] }),
      subscription: { data: annual },
      product: {
        data: { id: 'prod_annual', object: 'product', store_identifier: 'bplan_pro_yearly' },
      },
    });
    const result = await fake.adapter.readUser(USER_ID);
    expect(result).toMatchObject({
      ok: true,
      data: { subscriptions: [{ productId: 'prod_annual', storeIdentifier: 'bplan_pro_yearly' }] },
    });
    expect(fake.invocations.filter((item) => item.argv[0] === 'products')).toHaveLength(1);
  });

  it('fails closed for an unknown internal Product, malformed Product, or catalog authorization', async () => {
    const unknown = await providerAdapter({ productExitCode: 5 }).adapter.readUser(USER_ID);
    const malformed = await providerAdapter({
      product: { data: { id: 'prod_monthly' } },
    }).adapter.readUser(USER_ID);
    const denied = await providerAdapter({ productExitCode: 4 }).adapter.readUser(USER_ID);
    expect(unknown).toMatchObject({ ok: false, error: { code: 'CLI_RESOURCE_NOT_FOUND' } });
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'REVENUECAT_RESPONSE_MALFORMED' },
    });
    expect(denied).toMatchObject({ ok: false, error: { code: 'CLI_AUTHORIZATION' } });
  });

  it('rejects a Product response whose internal ID differs from the subscription reference', async () => {
    const result = await providerAdapter({
      product: {
        data: { id: 'prod_other', object: 'product', store_identifier: 'bplan_pro_monthly' },
      },
    }).adapter.readUser(USER_ID);
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'REVENUECAT_RESPONSE_MALFORMED' },
    });
  });

  it('deduplicates Product reads and rejects ambiguous canonical mappings', async () => {
    const first = subscription({ id: 'sub_one', product_id: 'prod_one' });
    const second = subscription({ id: 'sub_two', product_id: 'prod_one' });
    const shared = providerAdapter({
      customer: customerProfile({ subscriptions: [first, second] }),
      subscription: (id: string) => ({ data: id === 'sub_one' ? first : second }),
      product: {
        data: { id: 'prod_one', object: 'product', store_identifier: 'bplan_pro_monthly' },
      },
    });
    expect((await shared.adapter.readUser(USER_ID)).ok).toBe(true);
    expect(shared.invocations.filter((item) => item.argv[0] === 'products')).toHaveLength(1);

    const another = subscription({ id: 'sub_two', product_id: 'prod_two' });
    const ambiguous = await providerAdapter({
      customer: customerProfile({ subscriptions: [first, another] }),
      subscription: (id: string) => ({ data: id === 'sub_one' ? first : another }),
      product: (id: string) => ({
        data: { id, object: 'product', store_identifier: 'bplan_pro_monthly' },
      }),
    }).adapter.readUser(USER_ID);
    expect(ambiguous).toMatchObject({
      ok: false,
      error: { code: 'REVENUECAT_PRODUCT_MAPPING_AMBIGUOUS' },
    });
  });

  it('rejects production state before it can be accepted as sandbox evidence', async () => {
    const production = subscription({ environment: 'production' });
    const result = await providerAdapter({
      customer: customerProfile({ subscriptions: [production] }),
      subscription: { data: production, schema_version: 1 },
    }).adapter.readUser(USER_ID);

    expect(result).toMatchObject({ ok: false, error: { code: 'REVENUECAT_PRODUCTION_STATE' } });
  });

  it('fails closed for malformed customer and subscription output', async () => {
    const malformedCustomer = await providerAdapter({
      customer: { data: { customer: {} } },
    }).adapter.readUser(USER_ID);
    const malformedSubscription = await providerAdapter({
      subscription: { data: { id: 'sub_broken' } },
    }).adapter.readUser(USER_ID);

    expect(malformedCustomer).toMatchObject({
      ok: false,
      error: { code: 'REVENUECAT_RESPONSE_MALFORMED' },
    });
    expect(malformedSubscription).toMatchObject({
      ok: false,
      error: { code: 'REVENUECAT_RESPONSE_MALFORMED' },
    });
  });

  it('keeps zero and duplicate project discovery fail-closed', async () => {
    const none = await providerAdapter({ projects: { data: { items: [] } } }).adapter.readUser(
      USER_ID,
    );
    const duplicate = await providerAdapter({
      projects: {
        data: {
          items: [
            { id: 'proj_one', name: 'BPlan: Business Calendar' },
            { id: 'proj_two', name: 'BPlan: Business Calendar' },
          ],
        },
      },
    }).adapter.readUser(USER_ID);

    expect(none).toMatchObject({ ok: false, error: { code: 'PROJECT_NOT_FOUND' } });
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'PROJECT_DUPLICATE' } });
  });

  it('rejects entitlement continuation and malformed empty cursors before customer reads', async () => {
    for (const nextPage of ['next-page', '']) {
      const fake = providerAdapter({
        entitlements: { data: { ...entitlementList(), next_page: nextPage } },
      });
      const result = await fake.adapter.readUser(USER_ID);
      expect(result).toMatchObject({
        ok: false,
        error: {
          code:
            nextPage === '' ? 'REVENUECAT_RESPONSE_MALFORMED' : 'REVENUECAT_PAGINATION_UNSUPPORTED',
        },
      });
      expect(fake.invocations.map(({ argv }) => argv.slice(0, 2).join(' '))).not.toContain(
        'customers show',
      );
    }
  });

  it('rejects each incomplete customer list before following any subscription', async () => {
    for (const resource of ['active_entitlements', 'subscriptions', 'purchases'] as const) {
      const profile = customerProfile();
      const customer = profile.data.customer;
      const page =
        resource === 'active_entitlements' ? customer.active_entitlements : profile.data[resource];
      const fake = providerAdapter({
        customer: {
          ...profile,
          data: {
            ...profile.data,
            ...(resource === 'active_entitlements'
              ? {
                  customer: {
                    ...customer,
                    active_entitlements: { ...page, next_page: 'next-page' },
                  },
                }
              : { [resource]: { ...page, next_page: 'next-page' } }),
          },
        },
      });
      const result = await fake.adapter.readUser(USER_ID);
      expect(result).toMatchObject({
        ok: false,
        error: { code: 'REVENUECAT_PAGINATION_UNSUPPORTED' },
      });
      expect(fake.invocations.map(({ argv }) => argv.slice(0, 2).join(' '))).not.toContain(
        'subscriptions show',
      );
    }
  });

  it('rejects incomplete followed subscription and purchase entitlement lists', async () => {
    const partialSubscription = subscription({
      entitlements: { ...entitlementList(), next_page: 'next-page' },
    });
    const subscriptionResult = await providerAdapter({
      customer: customerProfile({ subscriptions: [partialSubscription] }),
      subscription: { data: partialSubscription },
    }).adapter.readUser(USER_ID);
    expect(subscriptionResult).toMatchObject({
      ok: false,
      error: { code: 'REVENUECAT_PAGINATION_UNSUPPORTED' },
    });

    const partialPurchase = purchase({
      entitlements: { ...entitlementList(), next_page: 'next-page' },
    });
    const purchaseResult = await providerAdapter({
      customer: customerProfile({ subscriptions: [], purchases: [partialPurchase] }),
      purchase: { data: partialPurchase },
    }).adapter.readUser(USER_ID);
    expect(purchaseResult).toMatchObject({
      ok: false,
      error: { code: 'REVENUECAT_PAGINATION_UNSUPPORTED' },
    });
  });
});

describe('cross-layer billing consistency', () => {
  it('passes when every layer agrees on active Pro', async () => {
    const report = await runWithSnapshots(activeProvider(), activeSupabase());
    expect(report.ok).toBe(true);
    expect(formatBillingAssertUserReport(report)).toContain('Result: PASS');
  });

  it.each(['monthly', 'annual'] as const)(
    'accepts one active %s subscription and an expired historical subscription',
    async (plan) => {
      const active = planSubscription(plan, 'active-subscription');
      const historical = planSubscription(plan, 'historical-subscription', {
        status: 'expired',
        givesAccess: false,
        currentPeriodEndsAt: NOW.getTime() - 86_400_000,
      });
      const report = await runWithSnapshots(
        activeProvider({ subscriptions: [active, historical] }),
        activeSupabase(),
        ['--user', USER_ID, '--expect', 'active-pro', '--plan', plan],
      );
      expect(report.ok).toBe(true);
    },
  );

  it.each(['monthly', 'annual'] as const)(
    'rejects two simultaneously active %s subscriptions without authorizing Pro',
    async (plan) => {
      const report = await runWithSnapshots(
        activeProvider({
          subscriptions: [
            planSubscription(plan, 'first-subscription'),
            planSubscription(plan, 'second-subscription'),
          ],
        }),
        activeSupabase({ serverAuthorized: true }),
        ['--user', USER_ID, '--expect', 'active-pro', '--plan', plan],
      );
      expect(report).toMatchObject({
        ok: false,
        userId: '[REDACTED]',
        failure: { code: 'REVENUECAT_MULTIPLE_ACTIVE_SUBSCRIPTIONS' },
      });
      const diagnostics = formatBillingAssertUserReport(report);
      expect(diagnostics).toContain('Result: FAIL');
      expect(diagnostics).not.toContain('first-subscription');
      expect(diagnostics).not.toContain('second-subscription');
      expect(diagnostics).not.toContain(USER_ID);
      expect(diagnostics).not.toContain(API_KEY);
      expect(diagnostics).not.toContain(SERVICE_KEY);
      expect(JSON.stringify(report)).not.toContain(USER_ID);
      expect(JSON.stringify(report)).not.toContain('first-subscription');
      expect(JSON.stringify(report)).not.toContain('second-subscription');
    },
  );

  it.each(['monthly', 'annual'] as const)(
    'rejects simultaneous monthly and annual subscriptions when expecting %s',
    async (plan) => {
      const report = await runWithSnapshots(
        activeProvider({
          subscriptions: [
            planSubscription('monthly', 'monthly-subscription'),
            planSubscription('annual', 'annual-subscription'),
          ],
        }),
        activeSupabase(),
        ['--user', USER_ID, '--expect', 'active-pro', '--plan', plan],
      );
      expect(report).toMatchObject({
        ok: false,
        failure: { code: 'REVENUECAT_MULTIPLE_ACTIVE_SUBSCRIPTIONS' },
      });
    },
  );

  it('passes monthly evidence through the CLI plan scope', async () => {
    const monthly = await runWithSnapshots(
      activeProvider({
        subscriptions: [
          {
            ...activeProvider().subscriptions[0]!,
            productId: 'prod_monthly',
            storeIdentifier: 'bplan_pro_monthly',
          },
        ],
      }),
      activeSupabase(),
      ['--user', USER_ID, '--expect', 'active-pro', '--plan', 'monthly'],
    );
    expect(monthly.ok).toBe(true);
    expect(monthly.expectedPlan).toBe('monthly');
    expect(formatBillingAssertUserReport(monthly)).toMatch(/Expected plan\.+ monthly/);
  });

  it('requires the expected annual product and rejects cross-plan active evidence', async () => {
    const monthlyEvidence = activeProvider({
      subscriptions: [
        {
          ...activeProvider().subscriptions[0]!,
          productId: 'prod_monthly',
          storeIdentifier: 'bplan_pro_monthly',
        },
      ],
    });
    const annualEvidence = activeProvider({
      subscriptions: [
        {
          ...activeProvider().subscriptions[0]!,
          productId: 'prod_annual',
          storeIdentifier: 'bplan_pro_yearly',
        },
      ],
    });
    const annual = await runWithSnapshots(annualEvidence, activeSupabase(), [
      '--user',
      USER_ID,
      '--expect',
      'active-pro',
      '--plan',
      'annual',
    ]);
    const monthlyAsAnnual = await runWithSnapshots(monthlyEvidence, activeSupabase(), [
      '--user',
      USER_ID,
      '--expect',
      'active-pro',
      '--plan',
      'annual',
    ]);
    const annualAsMonthly = await runWithSnapshots(annualEvidence, activeSupabase(), [
      '--user',
      USER_ID,
      '--expect',
      'active-pro',
      '--plan',
      'monthly',
    ]);

    expect(annual.ok).toBe(true);
    expect(monthlyAsAnnual).toMatchObject({
      ok: false,
      failure: { code: 'REVENUECAT_EXPECTED_PLAN_MISSING' },
    });
    expect(annualAsMonthly).toMatchObject({
      ok: false,
      failure: { code: 'REVENUECAT_EXPECTED_PLAN_MISSING' },
    });
  });

  it('rejects a correct internal Product ID with an unexpected store identifier', async () => {
    const report = await runWithSnapshots(
      activeProvider({
        subscriptions: [
          {
            ...activeProvider().subscriptions[0]!,
            productId: 'prod_annual',
            storeIdentifier: 'unexpected_annual',
          },
        ],
      }),
      activeSupabase(),
      ['--user', USER_ID, '--expect', 'active-pro', '--plan', 'annual'],
    );
    expect(report).toMatchObject({
      ok: false,
      failure: { code: 'REVENUECAT_EXPECTED_PLAN_MISSING' },
    });
  });

  it('passes when every layer agrees on a free user', async () => {
    const report = await runWithSnapshots(
      activeProvider({
        customerExists: false,
        activePro: false,
        subscriptions: [],
      }),
      activeSupabase({ activeMirror: false, ledgerRows: [], serverAuthorized: false }),
      ['--user', USER_ID, '--expect', 'free'],
    );
    expect(report.ok).toBe(true);
  });

  it.each([
    [activeProvider(), activeSupabase({ activeMirror: false }), 'SUPABASE_ACTIVE_MIRROR_MISSING'],
    [
      activeProvider({ activePro: false, subscriptions: [] }),
      activeSupabase(),
      'REVENUECAT_PRO_INACTIVE',
    ],
    [activeProvider(), activeSupabase({ serverAuthorized: false }), 'SERVER_AUTHORIZATION_FALSE'],
  ])('fails with the disagreeing layer identified', async (provider, supabase, code) => {
    const report = await runWithSnapshots(provider, supabase);
    expect(report).toMatchObject({ ok: false, failure: { code } });
  });

  it('returns stable exit codes and invokes read-only adapters only', async () => {
    const revenueCat = fixedAdapter({ ok: true, data: activeProvider() });
    const supabase = fixedAdapter({ ok: true, data: activeSupabase() });
    const output: string[] = [];
    const passCode = await runBillingAssertUserCommand(
      {
        environment: LIVE_ENV,
        argv: ['--user', USER_ID],
        revenueCat: revenueCat as RevenueCatAssertionAdapter,
        supabase: supabase as SupabaseAssertionAdapter,
      },
      (text) => output.push(text),
    );
    const failCode = await runBillingAssertUserCommand(
      { environment: LIVE_ENV, argv: ['--user', 'invalid'] },
      (text) => output.push(text),
    );

    expect(passCode).toBe(0);
    expect(failCode).toBe(1);
    expect(revenueCat.readUser).toHaveBeenCalledOnce();
    expect(supabase.readUser).toHaveBeenCalledOnce();
    expect(output.join('\n')).not.toContain(API_KEY);
    expect(output.join('\n')).not.toContain(SERVICE_KEY);
  });
});
