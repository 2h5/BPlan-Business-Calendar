import { describe, expect, it } from 'vitest';

import {
  checkoutAvailability,
  revenueCatCheckoutUrl,
  type BillingConfig,
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
});
