import { describe, expect, it, vi } from 'vitest';

import {
  formatCheckoutProbeReport,
  runCheckoutProbe,
  type CheckoutProbeReport,
} from './checkout-probe';
import {
  CheckoutProbeBrowserError,
  type CheckoutProbeBrowser,
  type CheckoutProbeObservation,
  type CheckoutProbeSession,
} from './checkout-probe-browser';
import { buildSandboxCheckoutRequest } from './checkout-ready';
import { REVENUECAT_PURCHASE_LINK_ORIGIN } from './contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PURCHASE_URL = 'https://pay.rev.cat/sandbox/test-token';
const READY_ENV = {
  BILLING_AUTOMATION_MODE: 'sandbox-checkout-probe',
  BILLING_AUTOMATION_ENV: 'sandbox',
  BILLING_TEST_USER_ID: USER_ID,
  BILLING_REVENUECAT_SANDBOX_PURCHASE_URL: PURCHASE_URL,
} as const;

const READY_OBSERVATION: CheckoutProbeObservation = {
  topLevelOrigin: REVENUECAT_PURCHASE_LINK_ORIGIN,
  hostedCheckoutLoaded: true,
  stableInteractive: true,
};

interface FakeBrowserOptions {
  readonly observation?: CheckoutProbeObservation;
  readonly openFailure?: CheckoutProbeBrowserError;
  readonly openPromise?: Promise<CheckoutProbeSession>;
  readonly closeFailure?: boolean;
}

interface FakeBrowserControls {
  readonly browser: CheckoutProbeBrowser;
  readonly requests: Parameters<CheckoutProbeBrowser['openCheckout']>[0][];
  readonly sessionCloseCount: () => number;
  readonly browserCloseCount: () => number;
}

function makeFakeBrowser(options: FakeBrowserOptions = {}): FakeBrowserControls {
  const requests: Parameters<CheckoutProbeBrowser['openCheckout']>[0][] = [];
  let sessionCloseCount = 0;
  let browserCloseCount = 0;

  const browser: CheckoutProbeBrowser = {
    async openCheckout(request) {
      requests.push(request);
      if (options.openFailure) throw options.openFailure;
      if (options.openPromise) return options.openPromise;
      return {
        async observeCheckout() {
          return options.observation ?? READY_OBSERVATION;
        },
        async close() {
          sessionCloseCount += 1;
        },
      };
    },
    async close() {
      browserCloseCount += 1;
      if (options.closeFailure) throw new CheckoutProbeBrowserError('SAFETY');
    },
  };

  return {
    browser,
    requests,
    sessionCloseCount: () => sessionCloseCount,
    browserCloseCount: () => browserCloseCount,
  };
}

function runWithFake(
  browser: CheckoutProbeBrowser,
  overrides: Partial<typeof READY_ENV> = {},
  argv: readonly string[] = ['--plan', 'monthly'],
  timeoutMs?: number,
): Promise<CheckoutProbeReport> {
  return runCheckoutProbe({
    environment: { ...READY_ENV, ...overrides },
    argv,
    browserFactory: () => browser,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

describe('sandbox checkout probe safety boundary', () => {
  it('sends the identified monthly package request to the injected browser adapter', async () => {
    const fake = makeFakeBrowser();
    const report = await runWithFake(fake.browser);

    expect(report).toMatchObject({
      ok: true,
      plan: 'monthly',
      packageId: '$rc_monthly',
      checkoutHost: 'pay.rev.cat',
      paymentAttempted: 'NO',
    });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({
      targetEnvironment: 'sandbox',
      userId: USER_ID,
      packageId: '$rc_monthly',
      productId: 'bplan_pro_monthly',
      url: `https://pay.rev.cat/sandbox/test-token/${USER_ID}?package_id=%24rc_monthly&email=bcalai-billing-sandbox%40example.com`,
    });
  });

  it('keeps annual support in the shared contract without requiring a live annual run', async () => {
    const fake = makeFakeBrowser();
    const ready = buildSandboxCheckoutRequest({
      userId: USER_ID,
      plan: 'annual',
      purchaseLinkBaseUrl: PURCHASE_URL,
      targetEnvironment: 'sandbox',
    });
    const report = await runWithFake(fake.browser, {}, ['--plan', 'annual']);

    expect(ready).toMatchObject({ ok: true, request: { packageId: '$rc_annual' } });
    expect(report).toMatchObject({ ok: true, plan: 'annual', packageId: '$rc_annual' });
    expect(fake.requests[0]?.packageId).toBe('$rc_annual');
  });

  it('rejects production before browser construction', async () => {
    const factory = vi.fn(() => makeFakeBrowser().browser);
    const report = await runCheckoutProbe({
      environment: { ...READY_ENV, BILLING_AUTOMATION_ENV: 'production' },
      argv: ['--plan', 'monthly'],
      browserFactory: factory,
    });

    expect(report.failure?.code).toBe('PRODUCTION_TARGET_FORBIDDEN');
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects the wrong execution mode before browser construction', async () => {
    const factory = vi.fn(() => makeFakeBrowser().browser);
    const report = await runCheckoutProbe({
      environment: { ...READY_ENV, BILLING_AUTOMATION_MODE: 'live-readonly' },
      argv: ['--plan', 'monthly'],
      browserFactory: factory,
    });

    expect(report.failure?.code).toBe('CONFIGURATION_INVALID');
    expect(factory).not.toHaveBeenCalled();
  });

  it('rejects malformed UUID and purchase URL before browser construction', async () => {
    const factory = vi.fn(() => makeFakeBrowser().browser);
    const malformedUser = await runCheckoutProbe({
      environment: { ...READY_ENV, BILLING_TEST_USER_ID: 'person@example.com' },
      argv: ['--plan', 'monthly'],
      browserFactory: factory,
    });
    const malformedUrl = await runCheckoutProbe({
      environment: {
        ...READY_ENV,
        BILLING_REVENUECAT_SANDBOX_PURCHASE_URL: 'https://example.com/token',
      },
      argv: ['--plan', 'monthly'],
      browserFactory: factory,
    });

    expect(malformedUser.failure?.code).toBe('CONFIGURATION_INVALID');
    expect(malformedUrl.failure?.code).toBe('PURCHASE_URL_INVALID');
    expect(factory).not.toHaveBeenCalled();
  });

  it('maps browser unavailability to a stable error and always closes the browser', async () => {
    const fake = makeFakeBrowser({
      openFailure: new CheckoutProbeBrowserError('BROWSER_UNAVAILABLE'),
    });
    const report = await runWithFake(fake.browser);
    const output = formatCheckoutProbeReport(report);

    expect(report.failure?.code).toBe('BROWSER_UNAVAILABLE');
    expect(fake.sessionCloseCount()).toBe(0);
    expect(fake.browserCloseCount()).toBe(1);
    expect(output).not.toContain(USER_ID);
    expect(output).not.toContain('test-token');
    expect(output).not.toContain(PURCHASE_URL);
  });

  it('maps timeout to a stable error and closes the browser', async () => {
    const fake = makeFakeBrowser({
      openPromise: new Promise<CheckoutProbeSession>(() => undefined),
    });
    const report = await runWithFake(fake.browser, {}, ['--plan', 'monthly'], 5);

    expect(report.failure?.code).toBe('BROWSER_TIMEOUT');
    expect(fake.browserCloseCount()).toBe(1);
  });

  it('fails closed when the top-level checkout origin is unexpected', async () => {
    const fake = makeFakeBrowser({
      observation: {
        ...READY_OBSERVATION,
        topLevelOrigin: 'https://evil.example',
      },
    });
    const report = await runWithFake(fake.browser);

    expect(report.failure?.code).toBe('CHECKOUT_ORIGIN_MISMATCH');
    expect(report.ok).toBe(false);
    expect(fake.sessionCloseCount()).toBe(1);
    expect(fake.browserCloseCount()).toBe(1);
  });

  it('closes session and browser on success and failure', async () => {
    const success = makeFakeBrowser();
    const failure = makeFakeBrowser({
      observation: { ...READY_OBSERVATION, stableInteractive: false },
    });

    await runWithFake(success.browser);
    await runWithFake(failure.browser);

    expect(success.sessionCloseCount()).toBe(1);
    expect(success.browserCloseCount()).toBe(1);
    expect(failure.sessionCloseCount()).toBe(1);
    expect(failure.browserCloseCount()).toBe(1);
  });

  it('exposes no payment or arbitrary browser action in the probe contract', () => {
    const fake = makeFakeBrowser();

    expect(Object.keys(fake.browser).sort()).toEqual(['close', 'openCheckout']);
  });

  it('does not make network requests or expose URL identity in the reduced report', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const fake = makeFakeBrowser();
    const report = await runWithFake(fake.browser);
    const output = formatCheckoutProbeReport(report);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(output).toContain('Payment attempted............ NO');
    expect(output).not.toContain(USER_ID);
    expect(output).not.toContain('test-token');
    expect(output).not.toContain(PURCHASE_URL);
    vi.unstubAllGlobals();
  });
});
