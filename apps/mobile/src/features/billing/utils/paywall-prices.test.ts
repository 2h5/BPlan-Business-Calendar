import { describe, expect, it } from 'vitest';

import { buildPaywallPrices } from './paywall-prices';

const usd = (price: number) => ({ price, priceString: `$${price}`, currencyCode: 'USD' });

describe('buildPaywallPrices', () => {
  it('uses the store prices and their own strings when both plans are known', () => {
    const prices = buildPaywallPrices(usd(2.99), usd(29.99), 'en-US');
    expect(prices.fromStore).toBe(true);
    expect(prices.monthly).toEqual({ amount: 2.99, label: '$2.99' });
    expect(prices.annual).toEqual({ amount: 29.99, label: '$29.99' });
    expect(prices.savingsPercentage).toBe(16);
    expect(prices.savingsLabel).toBe('$5.89');
    expect(prices.annualPerMonthLabel).toBe('$2.50');
  });

  it('formats derived figures in the store currency', () => {
    const eur = (price: number, priceString: string) => ({
      price,
      priceString,
      currencyCode: 'EUR',
    });
    const prices = buildPaywallPrices(eur(2.99, '2,99 €'), eur(29.99, '29,99 €'), 'de-DE');
    expect(prices.monthly.label).toBe('2,99 €');
    expect(prices.savingsLabel).toMatch(/5,89\s€/);
  });

  it('falls back to the USD list prices when a plan is missing', () => {
    const prices = buildPaywallPrices(usd(2.99), null, 'en-US');
    expect(prices.fromStore).toBe(false);
    expect(prices.monthly.label).toBe('$2.99');
    expect(prices.annual.label).toBe('$29.99');
  });

  it('falls back when the two plans disagree on currency', () => {
    const prices = buildPaywallPrices(usd(2.99), { ...usd(29.99), currencyCode: 'EUR' }, 'en-US');
    expect(prices.fromStore).toBe(false);
  });
});
