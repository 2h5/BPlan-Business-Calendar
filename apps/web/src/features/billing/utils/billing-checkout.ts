import { uuidSchema } from '@cal/schemas';

export type BillingMode = 'disabled' | 'sandbox' | 'production';

export interface BillingConfig {
  mode: BillingMode;
  purchaseUrl?: string;
  sellerIdentityConfirmed: boolean;
  legalDocsFinal: boolean;
  termsUrl?: string;
  privacyUrl?: string;
}

export type CheckoutAvailability =
  'disabled' | 'unconfigured' | 'sandbox' | 'production-blocked' | 'production';

/**
 * Production is a deliberate two-person/business decision, not a default.
 * Sandbox testing can proceed while seller and final-document decisions remain
 * open; production requires both explicit confirmations and public URLs.
 */
export function checkoutAvailability(config: BillingConfig): CheckoutAvailability {
  if (config.mode === 'disabled') return 'disabled';
  if (!config.purchaseUrl) return 'unconfigured';
  if (config.mode === 'sandbox') return 'sandbox';
  if (
    !config.sellerIdentityConfirmed ||
    !config.legalDocsFinal ||
    !config.termsUrl ||
    !config.privacyUrl
  ) {
    return 'production-blocked';
  }
  return 'production';
}

export function isCheckoutAvailable(config: BillingConfig): boolean {
  const availability = checkoutAvailability(config);
  return availability === 'sandbox' || availability === 'production';
}

/** RevenueCat identified purchase links use the Supabase auth UUID as the path segment. */
export function revenueCatCheckoutUrl(config: BillingConfig, userId: string | null): string | null {
  if (!userId || !config.purchaseUrl || !isCheckoutAvailable(config)) return null;

  const parsedUserId = uuidSchema.safeParse(userId);
  if (!parsedUserId.success) return null;

  const url = new URL(config.purchaseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(parsedUserId.data)}`;
  return url.toString();
}
