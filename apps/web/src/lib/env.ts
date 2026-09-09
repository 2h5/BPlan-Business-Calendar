import { z } from 'zod';

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

/**
 * Validate browser environment configuration at startup.
 * Only VITE_* variables are exposed to the browser client.
 * Server secrets, service-role keys, and OAuth client secrets MUST NEVER be loaded here.
 */
const envSchema = z.object({
  supabaseUrl: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(20, 'VITE_SUPABASE_ANON_KEY is missing or invalid'),
  appEnv: z.enum(['development', 'preview', 'production']).default('development'),
  billingMode: z.enum(['disabled', 'sandbox', 'production']).default('disabled'),
  revenueCatWebPurchaseUrl: optionalUrl,
  revenueCatBillingManagementUrl: optionalUrl,
  billingSellerIdentityConfirmed: booleanFlag,
  billingLegalDocsFinal: booleanFlag,
  billingTermsUrl: optionalUrl,
  billingPrivacyUrl: optionalUrl,
});

const parsed = envSchema.safeParse({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  appEnv: import.meta.env.VITE_APP_ENV,
  billingMode: import.meta.env.VITE_BILLING_MODE,
  revenueCatWebPurchaseUrl: import.meta.env.VITE_REVENUECAT_WEB_PURCHASE_URL,
  revenueCatBillingManagementUrl: import.meta.env.VITE_REVENUECAT_BILLING_MANAGEMENT_URL,
  billingSellerIdentityConfirmed: import.meta.env.VITE_BILLING_SELLER_IDENTITY_CONFIRMED,
  billingLegalDocsFinal: import.meta.env.VITE_BILLING_LEGAL_DOCS_FINAL,
  billingTermsUrl: import.meta.env.VITE_BILLING_TERMS_URL,
  billingPrivacyUrl: import.meta.env.VITE_BILLING_PRIVACY_URL,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.message}`).join('\n');
  throw new Error(
    `Missing or invalid web environment configuration:\n${issues}\n\n` +
      'Copy apps/web/.env.example to apps/web/.env.local and fill in the values.',
  );
}

export const env = parsed.data;
export const isDevelopment = env.appEnv === 'development';
