import { clientAppEnvSchema, refinePublicSupabaseConfig } from '@cal/schemas';
import { z } from 'zod';

import { billingEnvIssues } from '../features/billing/utils/billing-checkout';

/**
 * The web client's environment contract, independent of `import.meta.env` so
 * the same rules run in the browser at startup and in `vite.config.ts` at
 * build time.
 *
 * Only VITE_* variables are exposed to the browser client.
 * Server secrets, service-role keys, and OAuth client secrets MUST NEVER be loaded here.
 */
const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const webEnvSchema = z
  .object({
    supabaseUrl: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
    supabaseAnonKey: z.string().min(20, 'VITE_SUPABASE_ANON_KEY is missing or invalid'),
    appEnv: clientAppEnvSchema.default('development'),
    billingMode: z.enum(['disabled', 'sandbox', 'production']).default('disabled'),
    revenueCatWebPurchaseUrl: optionalUrl,
    revenueCatBillingManagementUrl: optionalUrl,
    billingSellerIdentityConfirmed: booleanFlag,
    billingLegalDocsFinal: booleanFlag,
    billingTermsUrl: optionalUrl,
    billingPrivacyUrl: optionalUrl,
  })
  .superRefine((value, ctx) => {
    refinePublicSupabaseConfig(value, ctx, {
      url: 'VITE_SUPABASE_URL',
      key: 'VITE_SUPABASE_ANON_KEY',
    });
    const billing = {
      mode: value.billingMode,
      purchaseUrl: value.revenueCatWebPurchaseUrl,
      managementUrl: value.revenueCatBillingManagementUrl,
      sellerIdentityConfirmed: value.billingSellerIdentityConfirmed,
      legalDocsFinal: value.billingLegalDocsFinal,
      termsUrl: value.billingTermsUrl,
      privacyUrl: value.billingPrivacyUrl,
    };
    for (const issue of billingEnvIssues(billing, value.appEnv)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
    }
  });

export type WebEnv = z.infer<typeof webEnvSchema>;

export type WebEnvSource = Partial<Record<string, string>>;

/** Validate raw VITE_* values; returns readable issues instead of throwing. */
export function parseWebEnv(
  source: WebEnvSource,
): { success: true; env: WebEnv } | { success: false; issues: string[] } {
  const parsed = webEnvSchema.safeParse({
    supabaseUrl: source.VITE_SUPABASE_URL,
    supabaseAnonKey: source.VITE_SUPABASE_ANON_KEY,
    appEnv: source.VITE_APP_ENV,
    billingMode: source.VITE_BILLING_MODE,
    revenueCatWebPurchaseUrl: source.VITE_REVENUECAT_WEB_PURCHASE_URL,
    revenueCatBillingManagementUrl: source.VITE_REVENUECAT_BILLING_MANAGEMENT_URL,
    billingSellerIdentityConfirmed: source.VITE_BILLING_SELLER_IDENTITY_CONFIRMED,
    billingLegalDocsFinal: source.VITE_BILLING_LEGAL_DOCS_FINAL,
    billingTermsUrl: source.VITE_BILLING_TERMS_URL,
    billingPrivacyUrl: source.VITE_BILLING_PRIVACY_URL,
  });
  if (parsed.success) return { success: true, env: parsed.data };
  return { success: false, issues: parsed.error.issues.map((issue) => issue.message) };
}

/**
 * Deployed builds are validated before any asset is written. A local or CI
 * build without VITE_APP_ENV stays a development build and is checked in the
 * browser at startup instead, as before.
 */
export function assertDeployableWebEnv(source: WebEnvSource): void {
  const appEnv = source.VITE_APP_ENV?.trim();
  if (appEnv !== 'preview' && appEnv !== 'production') return;

  const result = parseWebEnv(source);
  if (!result.success) {
    throw new Error(
      `Refusing to build web for ${appEnv} with invalid configuration:\n` +
        result.issues.map((issue) => `  • ${issue}`).join('\n'),
    );
  }
}
