import { describe, expect, it, vi } from 'vitest';

import type { BillingUserAssertionCheck, BillingUserAssertionReport } from './assert-user';
import type { BillingAssertionCategory } from './assertion-types';
import { SANDBOX_CHECKOUT_TEST_EMAIL } from './checkout-ready';
import {
  classifyHostedSemanticSignals,
  classifyTopLevelRequirement,
} from './playwright-sandbox-purchase';
import {
  formatSandboxPurchaseReport,
  runSandboxPurchase,
  type SandboxPurchaseOptions,
} from './sandbox-purchase';
import {
  SandboxPurchaseBrowserError,
  type SandboxPurchaseBrowser,
  type SandboxHostedResult,
  type SandboxSubmissionObservation,
  type SandboxPurchaseSession,
} from './sandbox-purchase-browser';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PURCHASE_URL = 'https://pay.rev.cat/sandbox/test-token';
const READY_ENV = {
  BILLING_AUTOMATION_MODE: 'sandbox-purchase',
  BILLING_AUTOMATION_ENV: 'sandbox',
  BILLING_TEST_USER_ID: USER_ID,
  BILLING_REVENUECAT_SANDBOX_PURCHASE_URL: PURCHASE_URL,
  BILLING_PLAYWRIGHT_EXECUTABLE_PATH: 'C:\\Browser\\chrome.exe',
  REVENUECAT_API_KEY: 'provider-secret',
  BILLING_SUPABASE_URL: 'https://example.supabase.co',
  BILLING_SUPABASE_SERVICE_ROLE_KEY: 'database-secret',
} as const;

const CATEGORIES: readonly BillingAssertionCategory[] = [
  'CLI_VERSION',
  'REVENUECAT_PROJECT',
  'REVENUECAT_CUSTOMER',
  'REVENUECAT_ENTITLEMENT',
  'REVENUECAT_SUBSCRIPTION',
  'SUPABASE_MIRROR',
  'SUBSCRIPTION_LEDGER',
  'SERVER_AUTHORIZATION',
];

function assertion(
  ok: boolean,
  expectedState: 'free' | 'active-pro',
  failureCategory: BillingAssertionCategory = 'REVENUECAT_ENTITLEMENT',
): BillingUserAssertionReport {
  const failureIndex = CATEGORIES.indexOf(failureCategory);
  const checks: BillingUserAssertionCheck[] = CATEGORIES.slice(
    0,
    ok ? CATEGORIES.length : Math.max(0, failureIndex),
  ).map((category) => ({
    category,
    label: category,
    status: 'PASS',
    value: 'PASS',
    message: 'safe',
  }));
  if (!ok) {
    checks.push({
      category: failureCategory,
      label: failureCategory,
      status: 'FAIL',
      value: 'FAIL',
      message: 'safe',
    });
  }
  return {
    ok,
    userId: USER_ID,
    targetEnvironment: 'sandbox',
    expectedState,
    checks,
    ...(ok
      ? {}
      : {
          failure: {
            category: failureCategory,
            code: 'NOT_CONVERGED',
            message: 'safe',
          },
        }),
  };
}

interface FakeBrowserOptions {
  readonly failureAt?: 'open' | 'ready' | 'payment' | 'submit' | 'hosted';
  readonly failure?: SandboxPurchaseBrowserError;
  readonly submission?: SandboxSubmissionObservation;
  readonly hostedResult?: SandboxHostedResult;
  readonly closeFailure?: boolean;
}

function fakeBrowser(options: FakeBrowserOptions = {}) {
  const calls: string[] = [];
  let sessionCloses = 0;
  let browserCloses = 0;
  const error = options.failure ?? new SandboxPurchaseBrowserError('SAFETY');
  const session: SandboxPurchaseSession = {
    async observeCheckoutReady() {
      calls.push('ready');
      if (options.failureAt === 'ready') throw error;
    },
    async enterApprovedStripeSandboxFixture() {
      calls.push('fixture');
      if (options.failureAt === 'payment') throw error;
    },
    async attemptSandboxPurchaseOnce() {
      calls.push('submit');
      if (options.failureAt === 'submit') throw error;
      return options.submission ?? { actionAttempted: true, state: 'processing' };
    },
    async observeHostedResult() {
      calls.push('hosted');
      if (options.failureAt === 'hosted') throw error;
      return options.hostedResult ?? 'success';
    },
    async close() {
      calls.push('session-close');
      sessionCloses += 1;
      if (options.closeFailure) throw error;
    },
  };
  const browser: SandboxPurchaseBrowser = {
    async openIdentifiedSandboxCheckout() {
      calls.push('open');
      if (options.failureAt === 'open') throw error;
      return session;
    },
    async close() {
      calls.push('browser-close');
      browserCloses += 1;
      if (options.closeFailure) throw error;
    },
  };
  return {
    browser,
    calls,
    sessionCloses: () => sessionCloses,
    browserCloses: () => browserCloses,
  };
}

function options(
  browser: SandboxPurchaseBrowser,
  overrides: Partial<SandboxPurchaseOptions> = {},
): SandboxPurchaseOptions {
  return {
    environment: READY_ENV,
    argv: ['--plan', 'monthly'],
    browserFactory: () => browser,
    browserExecutableIsValid: () => true,
    assertUser: async (expected) => assertion(true, expected),
    ...overrides,
  };
}

describe('sandbox purchase configuration boundary', () => {
  it.each([
    [{ BILLING_AUTOMATION_MODE: 'live-readonly' }, 'CONFIGURATION_INVALID'],
    [{ BILLING_AUTOMATION_ENV: 'production' }, 'PRODUCTION_TARGET_FORBIDDEN'],
    [{ BILLING_TEST_USER_ID: 'person@example.com' }, 'CONFIGURATION_INVALID'],
    [
      { BILLING_REVENUECAT_SANDBOX_PURCHASE_URL: 'https://example.com/sandbox/token' },
      'CONFIGURATION_INVALID',
    ],
    [{ BILLING_PLAYWRIGHT_EXECUTABLE_PATH: '' }, 'BROWSER_UNAVAILABLE'],
  ])('rejects unsafe configuration before browser construction', async (environment, code) => {
    const factory = vi.fn(() => fakeBrowser().browser);
    const result = await runSandboxPurchase({
      ...options(fakeBrowser().browser),
      environment: { ...READY_ENV, ...environment },
      browserFactory: factory,
    });
    expect(result.failure?.code).toBe(code);
    expect(factory).not.toHaveBeenCalled();
  });

  it('accepts annual execution through the same one-shot runner', async () => {
    const factory = vi.fn(() => fakeBrowser().browser);
    const result = await runSandboxPurchase({
      ...options(fakeBrowser().browser),
      argv: ['--plan', 'annual'],
      browserFactory: factory,
    });
    expect(result).toMatchObject({ ok: true, plan: 'annual' });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid executable before browser construction', async () => {
    const factory = vi.fn(() => fakeBrowser().browser);
    const result = await runSandboxPurchase({
      ...options(fakeBrowser().browser),
      browserFactory: factory,
      browserExecutableIsValid: () => false,
    });
    expect(result.failure?.code).toBe('BROWSER_UNAVAILABLE');
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not let the standalone read-only mode authorize this mutating command', async () => {
    const result = await runSandboxPurchase({
      ...options(fakeBrowser().browser),
      environment: { ...READY_ENV, BILLING_AUTOMATION_MODE: 'live-readonly' },
    });
    expect(result.failure?.code).toBe('CONFIGURATION_INVALID');
  });
});

describe('hosted semantic state classification', () => {
  it.each([
    [
      { validationBlocked: true, processing: false, success: false, rejected: false },
      'validation-blocked',
    ],
    [{ validationBlocked: false, processing: true, success: false, rejected: false }, 'processing'],
    [{ validationBlocked: false, processing: false, success: true, rejected: false }, 'success'],
    [{ validationBlocked: false, processing: false, success: false, rejected: true }, 'rejected'],
    [{ validationBlocked: false, processing: false, success: false, rejected: false }, 'unknown'],
    [{ validationBlocked: true, processing: true, success: false, rejected: false }, 'unknown'],
  ] as const)('classifies semantic hosted signals as %s', (signals, state) => {
    expect(classifyHostedSemanticSignals(signals)).toBe(state);
  });

  it.each([
    [
      { emailRequired: true, requiredCheckboxUnsatisfied: false, otherRequiredField: false },
      'EMAIL_REQUIRED',
    ],
    [
      { emailRequired: false, requiredCheckboxUnsatisfied: true, otherRequiredField: false },
      'REQUIRED_CHECKBOX_UNSATISFIED',
    ],
    [
      { emailRequired: false, requiredCheckboxUnsatisfied: false, otherRequiredField: true },
      'OTHER_REQUIRED_FIELD',
    ],
    [
      { emailRequired: false, requiredCheckboxUnsatisfied: false, otherRequiredField: false },
      'UNKNOWN_REQUIRED_FIELD',
    ],
  ] as const)('reports a safe top-level validation category', (signals, category) => {
    expect(classifyTopLevelRequirement(signals)).toBe(category);
  });
});

describe('sandbox purchase one-shot orchestration', () => {
  it('stops at a failed free baseline without constructing a browser', async () => {
    const factory = vi.fn(() => fakeBrowser().browser);
    const assertUser = vi.fn(async (_expected: 'free' | 'active-pro') => assertion(false, 'free'));
    const result = await runSandboxPurchase({
      ...options(fakeBrowser().browser),
      browserFactory: factory,
      assertUser,
    });
    expect(result.failure?.code).toBe('FREE_BASELINE_FAILED');
    expect(assertUser).toHaveBeenCalledWith('free');
    expect(factory).not.toHaveBeenCalled();
  });

  it.each([
    ['open', 'BROWSER_UNAVAILABLE'],
    ['payment', 'PAYMENT_FORM_UNAVAILABLE'],
  ] as const)('maps pre-submit browser failures without purchase', async (failureAt, code) => {
    const fake = fakeBrowser({
      failureAt,
      failure: new SandboxPurchaseBrowserError(code),
    });
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result.failure?.code).toBe(code);
    expect(result.purchaseSubmitted).toBe('NO');
    expect(fake.browserCloses()).toBe(1);
  });

  it('uses only the approved no-argument payment operation and submits once', async () => {
    const fake = fakeBrowser();
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result.ok).toBe(true);
    expect(fake.calls).toEqual([
      'open',
      'ready',
      'fixture',
      'submit',
      'hosted',
      'session-close',
      'browser-close',
    ]);
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
    expect(Object.keys(fake.browser).sort()).toEqual(['close', 'openIdentifiedSandboxCheckout']);
  });

  it('resolves an uncertain submission from active authority state without retrying', async () => {
    const fake = fakeBrowser({ submission: { actionAttempted: true, state: 'unknown' } });
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result.ok).toBe(true);
    expect(result.browserSubmission).toBe('UNKNOWN');
    expect(result.authorityReconciliation).toBe('PASS');
    expect(result.purchaseConfirmed).toBe('YES');
    expect(result.purchaseSubmitted).toBe('UNKNOWN');
    expect(result.retryDisposition).toBe('DO NOT RETRY');
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
    expect(fake.calls).not.toContain('hosted');
  });

  it('resolves an uncertain annual submission from annual authority state without retrying', async () => {
    const fake = fakeBrowser({ submission: { actionAttempted: true, state: 'unknown' } });
    const result = await runSandboxPurchase(options(fake.browser, { argv: ['--plan', 'annual'] }));
    expect(result).toMatchObject({
      ok: true,
      plan: 'annual',
      browserSubmission: 'UNKNOWN',
      authorityReconciliation: 'PASS',
      purchaseConfirmed: 'YES',
      retryDisposition: 'DO NOT RETRY',
    });
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
    expect(fake.calls).not.toContain('hosted');
  });

  it('reports an explicit no-transition result when authorities remain coherently free', async () => {
    const fake = fakeBrowser({ submission: { actionAttempted: true, state: 'unknown' } });
    let clock = 0;
    const assertUser = vi.fn(async (expected: 'free' | 'active-pro') =>
      expected === 'free' ? assertion(true, 'free') : assertion(false, 'active-pro'),
    );
    const result = await runSandboxPurchase(
      options(fake.browser, {
        assertUser,
        convergenceTimeoutMs: 10,
        convergenceIntervalMs: 5,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      }),
    );
    expect(result).toMatchObject({
      failure: { code: 'PURCHASE_NOT_COMPLETED' },
      browserSubmission: 'UNKNOWN',
      authorityReconciliation: 'FREE',
      purchaseConfirmed: 'NO',
      purchaseSubmitted: 'UNKNOWN',
      retryDisposition: 'DO NOT RETRY',
    });
    expect(assertUser.mock.calls.map((call) => call[0])).toEqual([
      'free',
      'active-pro',
      'free',
      'active-pro',
      'free',
      'active-pro',
      'free',
    ]);
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
    expect(fake.calls).not.toContain('hosted');
  });

  it('keeps an ambiguous submission unknown when authorities remain inconsistent', async () => {
    const fake = fakeBrowser({ submission: { actionAttempted: true, state: 'unknown' } });
    let clock = 0;
    let assertionCalls = 0;
    const assertUser = vi.fn(async (_expected: 'free' | 'active-pro') => {
      assertionCalls += 1;
      return assertionCalls === 1
        ? assertion(true, 'free')
        : assertion(false, 'active-pro', 'SUPABASE_MIRROR');
    });
    const result = await runSandboxPurchase(
      options(fake.browser, {
        assertUser,
        convergenceTimeoutMs: 10,
        convergenceIntervalMs: 5,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      }),
    );
    expect(result).toMatchObject({
      failure: { code: 'PURCHASE_STATE_UNKNOWN' },
      browserSubmission: 'UNKNOWN',
      authorityReconciliation: 'INCONSISTENT',
      purchaseConfirmed: 'UNKNOWN',
      retryDisposition: 'DO NOT RETRY',
    });
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
    expect(fake.calls).not.toContain('hosted');
  });

  it('distinguishes a known pre-click submit failure from an ambiguous submission', async () => {
    const fake = fakeBrowser({
      failureAt: 'submit',
      failure: new SandboxPurchaseBrowserError('PURCHASE_SUBMIT_FAILED'),
    });
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result.failure?.code).toBe('PURCHASE_SUBMIT_FAILED');
    expect(result.purchaseSubmitted).toBe('NO');
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
  });

  it('treats every post-submit observation failure as unknown and never resubmits', async () => {
    const fake = fakeBrowser({
      failureAt: 'hosted',
      failure: new SandboxPurchaseBrowserError('SAFETY'),
    });
    let clock = 0;
    const result = await runSandboxPurchase(
      options(fake.browser, {
        assertUser: (() => {
          let assertionCalls = 0;
          return async () => {
            assertionCalls += 1;
            return assertionCalls === 1
              ? assertion(true, 'free')
              : assertion(false, 'active-pro', 'SUPABASE_MIRROR');
          };
        })(),
        convergenceTimeoutMs: 10,
        convergenceIntervalMs: 5,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      }),
    );
    expect(result.failure?.code).toBe('PURCHASE_STATE_UNKNOWN');
    expect(result.authorityReconciliation).toBe('INCONSISTENT');
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
  });

  it('preserves an explicit hosted rejection without retrying', async () => {
    const fake = fakeBrowser({
      hostedResult: 'rejected',
    });
    const assertUser = vi.fn(async (expected: 'free' | 'active-pro') => assertion(true, expected));
    const result = await runSandboxPurchase(options(fake.browser, { assertUser }));
    expect(result.failure?.code).toBe('PURCHASE_REJECTED');
    expect(result.browserSubmission).toBe('REJECTED');
    expect(result.authorityReconciliation).toBe('NOT RUN');
    expect(result.retryDisposition).toBe('DO NOT RETRY');
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
    expect(assertUser).toHaveBeenCalledTimes(1);
  });

  it('keeps Purchase submitted NO when a successful click is validation-blocked', async () => {
    const fake = fakeBrowser({
      submission: { actionAttempted: true, state: 'validation-blocked' },
    });
    const assertUser = vi.fn(async (expected: 'free' | 'active-pro') => assertion(true, expected));
    const result = await runSandboxPurchase(options(fake.browser, { assertUser }));
    expect(result).toMatchObject({
      failure: { code: 'CHECKOUT_VALIDATION_BLOCKED' },
      submitActionAttempted: 'YES',
      providerSubmission: 'VALIDATION BLOCKED',
      purchaseSubmitted: 'NO',
      retryDisposition: 'SAFE AFTER FIX',
    });
    expect(assertUser).toHaveBeenCalledTimes(1);
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
    expect(fake.calls).not.toContain('hosted');
  });

  it('reports a missing required field before click as a deterministic retryable failure', async () => {
    const fake = fakeBrowser({
      submission: {
        actionAttempted: false,
        state: 'validation-blocked',
        validationCategory: 'REQUIRED_CHECKBOX_UNSATISFIED',
      },
    });
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result).toMatchObject({
      failure: { code: 'CHECKOUT_VALIDATION_BLOCKED' },
      submitActionAttempted: 'NO',
      purchaseSubmitted: 'NO',
      retryDisposition: 'SAFE AFTER FIX',
      validationCategory: 'REQUIRED_CHECKBOX_UNSATISFIED',
    });
  });

  it('marks provider processing as submitted before observing hosted success', async () => {
    const fake = fakeBrowser({
      submission: { actionAttempted: true, state: 'processing' },
      hostedResult: 'success',
    });
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result).toMatchObject({
      ok: true,
      submitActionAttempted: 'YES',
      providerSubmission: 'CONFIRMED',
      purchaseSubmitted: 'YES',
      retryDisposition: 'DO NOT RETRY',
      hostedSuccess: 'PASS',
    });
  });

  it('handles direct hosted success as confirmed without a second observation call', async () => {
    const fake = fakeBrowser({ submission: { actionAttempted: true, state: 'success' } });
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result.ok).toBe(true);
    expect(fake.calls).not.toContain('hosted');
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
  });

  it('closes the session and browser after success and failure', async () => {
    const success = fakeBrowser();
    const failure = fakeBrowser({ failureAt: 'ready' });
    await runSandboxPurchase(options(success.browser));
    await runSandboxPurchase(options(failure.browser));
    expect([success.sessionCloses(), success.browserCloses()]).toEqual([1, 1]);
    expect([failure.sessionCloses(), failure.browserCloses()]).toEqual([1, 1]);
  });

  it('fails closed when cleanup fails', async () => {
    const fake = fakeBrowser({ closeFailure: true });
    const result = await runSandboxPurchase(options(fake.browser));
    expect(result.failure?.code).toBe('PURCHASE_STATE_UNKNOWN');
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
  });
});

describe('sandbox purchase authority convergence and reporting', () => {
  function timeoutOptions(
    browser: SandboxPurchaseBrowser,
    category: BillingAssertionCategory,
  ): SandboxPurchaseOptions {
    let clock = 0;
    return options(browser, {
      assertUser: async (expected) =>
        expected === 'free' ? assertion(true, 'free') : assertion(false, 'active-pro', category),
      convergenceTimeoutMs: 10,
      convergenceIntervalMs: 5,
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds;
      },
    });
  }

  it.each([
    ['REVENUECAT_ENTITLEMENT', 'REVENUECAT_CONVERGENCE_TIMEOUT'],
    ['SUPABASE_MIRROR', 'SUPABASE_CONVERGENCE_TIMEOUT'],
    ['SERVER_AUTHORIZATION', 'SERVER_AUTHORIZATION_TIMEOUT'],
  ] as const)('requires %s authority convergence', async (category, code) => {
    const result = await runSandboxPurchase(timeoutOptions(fakeBrowser().browser, category));
    expect(result.failure?.code).toBe(code);
    expect(result.ok).toBe(false);
  });

  it('does not pass from hosted success alone', async () => {
    const fake = fakeBrowser();
    const result = await runSandboxPurchase(timeoutOptions(fake.browser, 'REVENUECAT_ENTITLEMENT'));
    expect(result.hostedSuccess).toBe('PASS');
    expect(result.authorityReconciliation).toBe('INCONSISTENT');
    expect(result.purchaseConfirmed).toBe('UNKNOWN');
    expect(result.ok).toBe(false);
  });

  it('does not pass annual browser success when annual authorities fail', async () => {
    let clock = 0;
    const annual = await runSandboxPurchase(
      options(fakeBrowser().browser, {
        argv: ['--plan', 'annual'],
        assertUser: async (expected) =>
          expected === 'free'
            ? assertion(true, 'free')
            : assertion(false, 'active-pro', 'REVENUECAT_ENTITLEMENT'),
        convergenceTimeoutMs: 10,
        convergenceIntervalMs: 5,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      }),
    );
    expect(annual).toMatchObject({
      plan: 'annual',
      hostedSuccess: 'PASS',
      authorityReconciliation: 'INCONSISTENT',
      ok: false,
    });
  });

  it('blocks an annual validation failure before hosted observation', async () => {
    const fake = fakeBrowser({
      submission: { actionAttempted: true, state: 'validation-blocked' },
    });
    const result = await runSandboxPurchase(options(fake.browser, { argv: ['--plan', 'annual'] }));
    expect(result).toMatchObject({
      plan: 'annual',
      failure: { code: 'CHECKOUT_VALIDATION_BLOCKED' },
      purchaseSubmitted: 'NO',
      retryDisposition: 'SAFE AFTER FIX',
    });
    expect(fake.calls).not.toContain('hosted');
    expect(fake.calls.filter((call) => call === 'submit')).toHaveLength(1);
  });

  it('reports browser uncertainty separately from authoritative success', async () => {
    const fake = fakeBrowser({ submission: { actionAttempted: true, state: 'unknown' } });
    const result = await runSandboxPurchase(options(fake.browser));
    const output = formatSandboxPurchaseReport(result);
    expect(output).toContain('Browser submission............. UNKNOWN');
    expect(output).toContain('Authority reconciliation....... PASS');
    expect(output).toContain('Purchase confirmed............. YES');
    expect(output).toContain('Hosted success................. UNKNOWN');
  });

  it('polls read-only assertions until every authority passes', async () => {
    const fake = fakeBrowser();
    let clock = 0;
    const results = [
      assertion(true, 'free'),
      assertion(false, 'active-pro', 'SUPABASE_MIRROR'),
      assertion(true, 'active-pro'),
    ];
    const assertUser = vi.fn(
      async (_expected: 'free' | 'active-pro') => results.shift() ?? assertion(true, 'active-pro'),
    );
    const result = await runSandboxPurchase(
      options(fake.browser, {
        assertUser,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      revenueCatPro: 'PASS',
      supabaseMirror: 'PASS',
      serverAuthorization: 'PASS',
    });
    expect(assertUser.mock.calls.map((call) => call[0])).toEqual([
      'free',
      'active-pro',
      'active-pro',
    ]);
  });

  it('redacts identity, URL, token, secrets, and payment fixture details', async () => {
    const result = await runSandboxPurchase(options(fakeBrowser().browser));
    const output = formatSandboxPurchaseReport(result);
    for (const forbidden of [
      USER_ID,
      PURCHASE_URL,
      'test-token',
      SANDBOX_CHECKOUT_TEST_EMAIL,
      READY_ENV.REVENUECAT_API_KEY,
      READY_ENV.BILLING_SUPABASE_SERVICE_ROLE_KEY,
      '4242424242424242',
      '123',
    ]) {
      expect(output).not.toContain(forbidden);
    }
    expect(output).toContain('Purchase submitted............. YES');
  });

  it('uses injected read-only assertions and makes no network call in tests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await runSandboxPurchase(options(fakeBrowser().browser));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
