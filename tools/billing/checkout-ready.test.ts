import { describe, expect, it } from 'vitest';

import {
  buildSandboxCheckoutRequest,
  formatCheckoutReadyReport,
  runCheckoutReady,
  SANDBOX_CHECKOUT_TEST_EMAIL,
} from './checkout-ready';
import { loadBillingEnvironment } from './config';
import { BILLING_CONTRACT } from './contract';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PURCHASE_URL = 'https://pay.rev.cat/sandbox/test-token';
const PURCHASE_URL_WITH_TRAILING_SLASH = `${PURCHASE_URL}/`;
const READY_ENV = {
  BILLING_AUTOMATION_ENV: 'sandbox',
  BILLING_TEST_USER_ID: USER_ID,
  BILLING_REVENUECAT_SANDBOX_PURCHASE_URL: PURCHASE_URL,
} as const;

describe('sandbox checkout URL contract', () => {
  it.each([
    ['monthly', '$rc_monthly', 'bplan_pro_monthly'],
    ['annual', '$rc_annual', 'bplan_pro_yearly'],
  ] as const)(
    'builds the identified %s package URL from the frozen contract',
    (plan, packageId, productId) => {
      const result = buildSandboxCheckoutRequest({
        userId: USER_ID,
        plan,
        purchaseLinkBaseUrl: PURCHASE_URL,
        targetEnvironment: 'sandbox',
      });

      expect(result).toMatchObject({
        ok: true,
        request: {
          packageId,
          productId,
        },
      });
      if (!result.ok) throw new Error('Expected checkout request');
      expect(result.request.packageId).toBe(BILLING_CONTRACT.offering.packages[plan]);
      expect(result.request.productId).toBe(BILLING_CONTRACT.products[plan].id);
      const url = new URL(result.request.url);
      expect(url.pathname).toBe(`/sandbox/test-token/${USER_ID}`);
      expect(url.pathname).not.toContain('//');
      expect(url.pathname.split(USER_ID)).toHaveLength(2);
      expect(url.searchParams.get('package_id')).toBe(packageId);
      expect(url.searchParams.get('email')).toBe(SANDBOX_CHECKOUT_TEST_EMAIL);
      expect([...url.searchParams.keys()]).toEqual(['package_id', 'email']);
    },
  );

  it('normalizes one provider-supplied trailing slash to the same identified URL', () => {
    const build = (purchaseLinkBaseUrl: string) =>
      buildSandboxCheckoutRequest({
        userId: USER_ID,
        plan: 'monthly',
        purchaseLinkBaseUrl,
        targetEnvironment: 'sandbox',
      });

    const withoutTrailingSlash = build(PURCHASE_URL);
    const withTrailingSlash = build(PURCHASE_URL_WITH_TRAILING_SLASH);

    expect(withoutTrailingSlash.ok).toBe(true);
    expect(withTrailingSlash.ok).toBe(true);
    if (!withoutTrailingSlash.ok || !withTrailingSlash.ok) {
      throw new Error('Expected both sandbox link templates to be accepted');
    }
    expect(withTrailingSlash.request.url).toBe(withoutTrailingSlash.request.url);
    expect(new URL(withTrailingSlash.request.url).pathname).toBe(`/sandbox/test-token/${USER_ID}`);
    expect(new URL(withTrailingSlash.request.url).pathname).not.toContain('//');
  });

  it('uses one fixed non-sensitive email only after the sandbox target is accepted', () => {
    const first = buildSandboxCheckoutRequest({
      userId: USER_ID,
      plan: 'monthly',
      purchaseLinkBaseUrl: PURCHASE_URL,
      targetEnvironment: 'sandbox',
    });
    const second = buildSandboxCheckoutRequest({
      userId: '22222222-2222-4222-8222-222222222222',
      plan: 'monthly',
      purchaseLinkBaseUrl: PURCHASE_URL,
      targetEnvironment: 'sandbox',
    });
    const production = buildSandboxCheckoutRequest({
      userId: USER_ID,
      plan: 'monthly',
      purchaseLinkBaseUrl: PURCHASE_URL,
      targetEnvironment: 'production',
    });

    expect(first.ok && new URL(first.request.url).searchParams.get('email')).toBe(
      SANDBOX_CHECKOUT_TEST_EMAIL,
    );
    expect(second.ok && new URL(second.request.url).searchParams.get('email')).toBe(
      SANDBOX_CHECKOUT_TEST_EMAIL,
    );
    expect(SANDBOX_CHECKOUT_TEST_EMAIL.endsWith('@example.com')).toBe(true);
    expect(production).toMatchObject({
      ok: false,
      error: { code: 'PRODUCTION_TARGET_FORBIDDEN' },
    });
  });

  it('rejects malformed identity, missing/HTTP/ambiguous URLs, and production', () => {
    const build = (overrides: Partial<Parameters<typeof buildSandboxCheckoutRequest>[0]> = {}) =>
      buildSandboxCheckoutRequest({
        userId: USER_ID,
        plan: 'monthly',
        purchaseLinkBaseUrl: PURCHASE_URL,
        targetEnvironment: 'sandbox',
        ...overrides,
      });

    expect(build({ userId: 'person@example.com' })).toMatchObject({
      ok: false,
      error: { code: 'USER_ID_INVALID' },
    });
    expect(build({ purchaseLinkBaseUrl: '' })).toMatchObject({
      ok: false,
      error: { code: 'PURCHASE_URL_MISSING' },
    });
    expect(build({ purchaseLinkBaseUrl: 'http://pay.rev.cat/token' })).toMatchObject({
      ok: false,
      error: { code: 'PURCHASE_URL_INVALID' },
    });
    expect(
      build({ purchaseLinkBaseUrl: 'https://pay.rev.cat/sandbox/test-token?source=settings' }),
    ).toMatchObject({
      ok: false,
      error: { code: 'PURCHASE_URL_INVALID' },
    });
    expect(build({ purchaseLinkBaseUrl: `${PURCHASE_URL}/${USER_ID}` })).toMatchObject({
      ok: false,
      error: { code: 'PURCHASE_URL_INVALID' },
    });
    expect(build({ targetEnvironment: 'production' })).toMatchObject({
      ok: false,
      error: { code: 'PRODUCTION_TARGET_FORBIDDEN' },
    });
  });

  it.each([
    'https://pay.rev.cat/token',
    'https://pay.rev.cat/sandbox',
    'https://pay.rev.cat/sandbox/test-token//',
    'https://pay.rev.cat/sandbox/test-token/extra',
    'https://pay.rev.cat:444/sandbox/test-token',
    'https://pay.rev.cat/sandbox/test-token%2Fnested',
    'https://pay.rev.cat/sandbox/test-token%5Cnested',
    'https://pay.rev.cat/sandbox/test-token\\nested',
    'https://pay.rev.cat/sandbox/test-token#fragment',
    'https://user:password@pay.rev.cat/sandbox/test-token',
  ])('rejects a non-canonical purchase-link endpoint: %s', (purchaseLinkBaseUrl) => {
    expect(
      buildSandboxCheckoutRequest({
        userId: USER_ID,
        plan: 'monthly',
        purchaseLinkBaseUrl,
        targetEnvironment: 'sandbox',
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'PURCHASE_URL_INVALID' },
    });
  });
});

describe('billing:checkout-ready command contract', () => {
  it('reports only reduced readiness information and never emits the configured URL/token', () => {
    const report = runCheckoutReady({ environment: READY_ENV, argv: ['--plan', 'monthly'] });
    const output = formatCheckoutReadyReport(report);

    expect(report.ok).toBe(true);
    expect(output).toContain('Result: READY');
    expect(output).toContain('$rc_monthly');
    expect(output).toContain('pay.rev.cat');
    expect(output).not.toContain(PURCHASE_URL);
    expect(output).not.toContain('test-token');
    expect(output).not.toContain(USER_ID);
    expect(output).not.toContain(SANDBOX_CHECKOUT_TEST_EMAIL);
  });

  it('rejects attempts to provide customer fields through command arguments', () => {
    const report = runCheckoutReady({
      environment: READY_ENV,
      argv: ['--plan', 'monthly', '--email', 'person@example.com'],
    });

    expect(report).toMatchObject({ ok: false, failure: { code: 'ARGUMENT_INVALID' } });
    expect(formatCheckoutReadyReport(report)).not.toContain('person@example.com');
  });

  it('fails closed when required configuration is absent without leaking URL input', () => {
    const report = runCheckoutReady({
      environment: {
        ...READY_ENV,
        BILLING_REVENUECAT_SANDBOX_PURCHASE_URL: 'https://example.com/private-token',
      },
      argv: ['--plan', 'annual'],
    });
    const output = formatCheckoutReadyReport(report);

    expect(report).toMatchObject({ ok: false, failure: { code: 'PURCHASE_URL_INVALID' } });
    expect(output).not.toContain('private-token');
    expect(output).not.toContain('https://');
  });

  it('preserves live-readonly and recognizes the explicit sandbox purchase mode', () => {
    expect(loadBillingEnvironment({ BILLING_AUTOMATION_MODE: 'live-readonly' }).config.mode).toBe(
      'live-readonly',
    );
    expect(
      loadBillingEnvironment({
        BILLING_AUTOMATION_MODE: 'sandbox-purchase',
        REVENUECAT_API_KEY: 'key',
        BILLING_SUPABASE_URL: 'https://example.supabase.co',
        BILLING_SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      }),
    ).toMatchObject({ config: { mode: 'sandbox-purchase' }, issues: [] });
  });
});
