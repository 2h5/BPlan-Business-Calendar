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
  currencyCode: string;
}

export interface PaywallSavings {
  /** Whole-number percentage the annual plan saves over twelve months. */
  percentage: number;
  label: string;
}

export interface PaywallPrices {
  /** Null when the store sells other plans but not this one. */
  monthly: PaywallPrice | null;
  annual: PaywallPrice | null;
  /** Null unless both plans are priced in the same currency. */
  savings: PaywallSavings | null;
  annualPerMonthLabel: string | null;
  /** The Free plan's "0", in the same currency as Pro. */
  freeLabel: string;
  /** False while showing the built-in USD list prices instead of the store's. */
  fromStore: boolean;
}

/**
 * The prices on the upgrade page.
 *
 * Once the store has priced any plan, every price on the page comes from the
 * store — Apple shows the buyer's own currency and the page must match the
 * payment sheet. A plan the store didn't return is shown as missing, never as
 * a USD list price next to a purchasable plan in another currency. The USD
 * list prices appear only when the store priced nothing, when nothing can be
 * bought anyway.
 */
export function buildPaywallPrices(
  monthly: PriceInput | null | undefined,
  annual: PriceInput | null | undefined,
  locale?: string,
): PaywallPrices {
  if (!monthly && !annual) {
    const usd = (amount: number): PaywallPrice => ({
      amount,
      label: format(amount, 'USD', locale),
      currencyCode: 'USD',
    });
    return build(usd(PRO_PLAN.monthlyPrice), usd(PRO_PLAN.annualPrice), false, locale);
  }
  return build(fromStore(monthly), fromStore(annual), true, locale);
}

function fromStore(input: PriceInput | null | undefined): PaywallPrice | null {
  if (!input) return null;
  return { amount: input.price, label: input.priceString, currencyCode: input.currencyCode };
}

function build(
  monthly: PaywallPrice | null,
  annual: PaywallPrice | null,
  isFromStore: boolean,
  locale: string | undefined,
): PaywallPrices {
  const currencyCode = (monthly ?? annual)?.currencyCode ?? 'USD';
  const comparable = monthly && annual && monthly.currencyCode === annual.currencyCode;
  const savings = comparable
    ? calculateBillingIntervalSavings(monthly.amount, annual.amount)
    : null;

  return {
    monthly,
    annual,
    savings:
      savings && savings.savingsPercentage > 0
        ? {
            percentage: savings.savingsPercentage,
            label: format(savings.savingsDollars, currencyCode, locale),
          }
        : null,
    annualPerMonthLabel: annual ? format(annual.amount / 12, annual.currencyCode, locale) : null,
    freeLabel: format(0, currencyCode, locale, 0),
    fromStore: isFromStore,
  };
}

function format(
  amount: number,
  currency: string,
  locale: string | undefined,
  minimumFractionDigits?: number,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...(minimumFractionDigits === undefined
      ? {}
      : { minimumFractionDigits, maximumFractionDigits: minimumFractionDigits }),
  }).format(amount);
}
