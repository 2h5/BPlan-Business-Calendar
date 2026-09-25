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

export interface BillingEnvConfig extends BillingConfig {
  managementUrl?: string;
}

/**
 * Deployment mistakes the checkout guard cannot see at run time.
 *
 * A production site must never offer sandbox checkout: purchases would look
 * real to the customer and grant nothing durable. Outside development every
 * billing link a customer follows must be HTTPS.
 */
export function billingEnvIssues(
  config: BillingEnvConfig,
  appEnv: 'development' | 'preview' | 'production',
): Array<{ path: keyof BillingEnvConfig; message: string }> {
  const issues: Array<{ path: keyof BillingEnvConfig; message: string }> = [];

  if (appEnv === 'production' && config.mode === 'sandbox') {
    issues.push({
      path: 'mode',
      message: 'VITE_BILLING_MODE=sandbox is not allowed when VITE_APP_ENV=production',
    });
  }

  if (appEnv !== 'development') {
    const links = [
      ['purchaseUrl', 'VITE_REVENUECAT_WEB_PURCHASE_URL'],
      ['managementUrl', 'VITE_REVENUECAT_BILLING_MANAGEMENT_URL'],
      ['termsUrl', 'VITE_BILLING_TERMS_URL'],
      ['privacyUrl', 'VITE_BILLING_PRIVACY_URL'],
    ] as const;
    for (const [path, name] of links) {
      const value = config[path];
      if (value && !value.startsWith('https://')) {
        issues.push({ path, message: `${name} must use https outside development` });
      }
    }
  }

  return issues;
}
