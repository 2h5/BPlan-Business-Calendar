import { calculateBillingIntervalSavings, PRO_PLAN } from '@cal/domain';

/** A store price as the upgrade page needs it. */
export interface PriceInput {
  price: number;
  priceString: string;
  currencyCode: string;
}

export interface PaywallPrice {
  amount: number;
  /** The store's own localized string, e.g. "$2.99" or "2,99 €". */
  label: string;
}

export interface PaywallPrices {
  monthly: PaywallPrice;
  annual: PaywallPrice;
  /** Whole-number percentage the annual plan saves over twelve months. */
  savingsPercentage: number;
  savingsLabel: string;
  annualPerMonthLabel: string;
  /** False while showing the built-in USD list prices instead of the store's. */
  fromStore: boolean;
}

/**
 * The prices on the upgrade page. Uses the store's localized prices when both
 * plans are known — Apple shows the buyer's own currency and the page must
 * match the payment sheet — and the list prices in USD otherwise.
 */
export function buildPaywallPrices(
  monthly: PriceInput | null | undefined,
  annual: PriceInput | null | undefined,
  locale?: string,
): PaywallPrices {
  if (monthly && annual && monthly.currencyCode === annual.currencyCode) {
    return build(
      { amount: monthly.price, label: monthly.priceString },
      { amount: annual.price, label: annual.priceString },
      monthly.currencyCode,
      true,
      locale,
    );
  }
  const usd = (amount: number) => ({ amount, label: format(amount, 'USD', locale) });
  return build(usd(PRO_PLAN.monthlyPrice), usd(PRO_PLAN.annualPrice), 'USD', false, locale);
}

function build(
  monthly: PaywallPrice,
  annual: PaywallPrice,
  currencyCode: string,
  fromStore: boolean,
  locale: string | undefined,
): PaywallPrices {
  const savings = calculateBillingIntervalSavings(monthly.amount, annual.amount);
  return {
    monthly,
    annual,
    savingsPercentage: savings.savingsPercentage,
    savingsLabel: format(savings.savingsDollars, currencyCode, locale),
    annualPerMonthLabel: format(annual.amount / 12, currencyCode, locale),
    fromStore,
  };
}

function format(amount: number, currency: string, locale: string | undefined): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
