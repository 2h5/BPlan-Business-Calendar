import { clientAppEnvSchema, refinePublicSupabaseConfig } from '@cal/schemas';
import { z } from 'zod';

/**
 * Fail fast and loudly on a misconfigured build rather than at the first
 * network call. Only EXPO_PUBLIC_* values may appear here — anything secret
 * belongs in an Edge Function, never in the bundle.
 */
const envSchema = z
  .object({
    supabaseUrl: z.string().url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL'),
    supabaseAnonKey: z.string().min(20, 'EXPO_PUBLIC_SUPABASE_ANON_KEY is missing'),
    appEnv: clientAppEnvSchema.default('development'),
    sentryDsn: z.string().optional(),
    /**
     * RevenueCat's public iOS SDK key. A `test_` key points at RevenueCat's
     * Test Store; without one, in-app purchase is unavailable in this build.
     */
    revenueCatIosKey: z.string().min(1).optional(),
    /** Shown on the upgrade page, as Apple requires for subscriptions. */
    billingTermsUrl: z.string().url('EXPO_PUBLIC_BILLING_TERMS_URL must be a URL').optional(),
    billingPrivacyUrl: z.string().url('EXPO_PUBLIC_BILLING_PRIVACY_URL must be a URL').optional(),
  })
  .superRefine((value, ctx) =>
    refinePublicSupabaseConfig(value, ctx, {
      url: 'EXPO_PUBLIC_SUPABASE_URL',
      key: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    }),
  );

const parsed = envSchema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || undefined,
  billingTermsUrl: process.env.EXPO_PUBLIC_BILLING_TERMS_URL || undefined,
  billingPrivacyUrl: process.env.EXPO_PUBLIC_BILLING_PRIVACY_URL || undefined,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.message}`).join('\n');
  throw new Error(
    `Missing or invalid environment configuration:\n${issues}\n\n` +
      'Copy apps/mobile/.env.example to apps/mobile/.env and fill it in (see README.md).',
  );
}

export const env = parsed.data;
export const isDevelopment = env.appEnv === 'development';
