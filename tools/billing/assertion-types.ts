export type BillingAssertionCategory =
  | 'CONFIGURATION'
  | 'CLI_VERSION'
  | 'REVENUECAT_PROJECT'
  | 'REVENUECAT_CUSTOMER'
  | 'REVENUECAT_ENTITLEMENT'
  | 'REVENUECAT_SUBSCRIPTION'
  | 'SUPABASE_MIRROR'
  | 'SUBSCRIPTION_LEDGER'
  | 'SERVER_AUTHORIZATION'
  | 'SAFETY';

export interface BillingAssertionFailure {
  readonly category: BillingAssertionCategory;
  readonly code: string;
  readonly message: string;
}

export type BillingAssertionResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: BillingAssertionFailure };

export function assertionFailure<T>(
  category: BillingAssertionCategory,
  code: string,
  message: string,
): BillingAssertionResult<T> {
  return { ok: false, error: { category, code, message } };
}
