import { describe, expect, it } from 'vitest';

import {
  billingEnvIssues,
  checkoutAvailability,
  revenueCatCheckoutUrl,
  type BillingConfig,
  type BillingEnvConfig,
} from './billing-checkout';

const baseConfig: BillingConfig = {
  mode: 'production',
  purchaseUrl: 'https://pay.rev.cat/example?source=settings',
  sellerIdentityConfirmed: false,
  legalDocsFinal: false,
  termsUrl: 'https://bplan.example/terms.html',
  privacyUrl: 'https://bplan.example/privacy.html',
};

const USER_ID = '11111111-1111-1111-1111-111111111111';

describe('billing checkout guard', () => {
  it('blocks production while the seller decision or legal confirmation is open', () => {
    expect(checkoutAvailability(baseConfig)).toBe('production-blocked');
    expect(
      checkoutAvailability({
        ...baseConfig,
        sellerIdentityConfirmed: true,
        legalDocsFinal: true,
        privacyUrl: undefined,
      }),
    ).toBe('production-blocked');
  });

  it('permits sandbox testing without enabling production checkout', () => {
    expect(
      checkoutAvailability({ ...baseConfig, mode: 'sandbox', sellerIdentityConfirmed: false }),
    ).toBe('sandbox');
  });

  it('requires explicit production confirmations before producing a purchase URL', () => {
    expect(revenueCatCheckoutUrl(baseConfig, USER_ID)).toBeNull();
    expect(
      revenueCatCheckoutUrl(
        { ...baseConfig, sellerIdentityConfirmed: true, legalDocsFinal: true },
        USER_ID,
      ),
    ).toBe('https://pay.rev.cat/example/11111111-1111-1111-1111-111111111111?source=settings');
  });

  it('uses only a valid authenticated UUID as the RevenueCat app user id', () => {
    expect(revenueCatCheckoutUrl({ ...baseConfig, mode: 'sandbox' }, 'not-an-email')).toBeNull();
  });

  it('marks disabled mode as disabled regardless of other flags', () => {
    expect(
      checkoutAvailability({
        ...baseConfig,
        mode: 'disabled',
        sellerIdentityConfirmed: true,
        legalDocsFinal: true,
      }),
    ).toBe('disabled');
  });

  it('marks unconfigured when purchaseUrl is missing', () => {
    expect(
      checkoutAvailability({
        ...baseConfig,
        mode: 'sandbox',
        purchaseUrl: undefined,
      }),
    ).toBe('unconfigured');
  });
});

describe('billing deployment guard', () => {
  const sandbox: BillingEnvConfig = { ...baseConfig, mode: 'sandbox' };

  it('refuses sandbox checkout in a production build', () => {
    expect(billingEnvIssues(sandbox, 'production').map((issue) => issue.path)).toEqual(['mode']);
    expect(billingEnvIssues(sandbox, 'preview')).toEqual([]);
    expect(billingEnvIssues(sandbox, 'development')).toEqual([]);
    expect(billingEnvIssues(baseConfig, 'production')).toEqual([]);
  });

  it('requires https billing links outside development', () => {
    const insecure: BillingEnvConfig = {
      ...baseConfig,
      purchaseUrl: 'http://pay.rev.cat/example',
      managementUrl: 'http://billing.example/manage',
      termsUrl: 'http://bplan.example/terms.html',
    };

    expect(billingEnvIssues(insecure, 'production').map((issue) => issue.path)).toEqual([
      'purchaseUrl',
      'managementUrl',
      'termsUrl',
    ]);
    expect(billingEnvIssues(insecure, 'preview')).toHaveLength(3);
    expect(billingEnvIssues(insecure, 'development')).toEqual([]);
  });
});
