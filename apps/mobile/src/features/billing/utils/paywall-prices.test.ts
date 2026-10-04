import { describe, expect, it } from 'vitest';

import { buildPaywallPrices } from './paywall-prices';

const usd = (price: number) => ({ price, priceString: `$${price}`, currencyCode: 'USD' });
const eur = (price: number, priceString: string) => ({
  price,
  priceString,
  currencyCode: 'EUR',
});

describe('buildPaywallPrices', () => {
  it('uses the store prices and their own strings when both plans are known', () => {
    const prices = buildPaywallPrices(usd(2.99), usd(29.99), 'en-US');
    expect(prices.fromStore).toBe(true);
    expect(prices.monthly).toEqual({ amount: 2.99, label: '$2.99', currencyCode: 'USD' });
    expect(prices.annual).toEqual({ amount: 29.99, label: '$29.99', currencyCode: 'USD' });
    expect(prices.savings).toEqual({ percentage: 16, label: '$5.89' });
    expect(prices.annualPerMonthLabel).toBe('$2.50');
    expect(prices.freeLabel).toBe('$0');
  });

  it('formats derived figures in the store currency', () => {
    const prices = buildPaywallPrices(eur(2.99, '2,99 €'), eur(29.99, '29,99 €'), 'de-DE');
    expect(prices.monthly?.label).toBe('2,99 €');
    expect(prices.savings?.label).toMatch(/5,89\s€/);
    expect(prices.freeLabel).toMatch(/0\s€/);
  });

  it('never shows a USD list price beside a purchasable plan in another currency', () => {
    // The store returned only the monthly product, priced in euros.
    const prices = buildPaywallPrices(eur(5.99, '5,99 €'), null, 'de-DE');
    expect(prices.fromStore).toBe(true);
    expect(prices.monthly?.label).toBe('5,99 €');
    expect(prices.annual).toBeNull();
    expect(prices.savings).toBeNull();
    expect(prices.annualPerMonthLabel).toBeNull();
    expect(prices.freeLabel).toMatch(/0\s€/);
  });

  it('keeps each plan’s own price when only the annual plan is known', () => {
    const prices = buildPaywallPrices(null, usd(29.99), 'en-US');
    expect(prices.monthly).toBeNull();
    expect(prices.annual?.label).toBe('$29.99');
    expect(prices.annualPerMonthLabel).toBe('$2.50');
  });

  it('drops the saving when the two plans disagree on currency', () => {
    const prices = buildPaywallPrices(usd(2.99), eur(29.99, '29,99 €'), 'en-US');
    expect(prices.fromStore).toBe(true);
    expect(prices.monthly?.label).toBe('$2.99');
    expect(prices.annual?.label).toBe('29,99 €');
    expect(prices.savings).toBeNull();
  });

  it('shows the USD list prices only when the store priced nothing', () => {
    const prices = buildPaywallPrices(null, undefined, 'en-US');
    expect(prices.fromStore).toBe(false);
    expect(prices.monthly?.label).toBe('$2.99');
    expect(prices.annual?.label).toBe('$29.99');
    expect(prices.savings?.percentage).toBe(16);
  });
});
