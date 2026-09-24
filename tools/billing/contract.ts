export const REVENUECAT_API_BASE_URL = 'https://api.revenuecat.com/v2' as const;
export const REVENUECAT_CLI_COMMAND = 'rc' as const;
/** Reviewed official release baseline; changing it requires a contract review. */
export const REVENUECAT_CLI_APPROVED_VERSION = '0.1.1' as const;
export const REVENUECAT_PURCHASE_LINK_HOST = 'pay.rev.cat' as const;
export const REVENUECAT_PURCHASE_LINK_ORIGIN = 'https://pay.rev.cat' as const;
export const REVENUECAT_SANDBOX_PURCHASE_LINK_PATH = 'sandbox' as const;
export const STRIPE_PAYMENT_FRAME_HOSTS = ['js.stripe.com', 'checkout.stripe.com'] as const;

export const REVENUECAT_PROJECT_ID_VERIFICATION = 'unverified-for-live-v2' as const;

export const BILLING_CONTRACT = {
  environment: 'sandbox',
  project: {
    name: 'BPlan: Business Calendar',
    documentedRunbookId: 'd455e7e9',
    idSource: 'repository-runbook',
    idVerification: REVENUECAT_PROJECT_ID_VERIFICATION,
  },
  webConfig: {
    name: 'BPlan: Business Calendar (RevenueCat Billing)',
    id: 'app48a77253da',
  },
  entitlement: 'pro',
  offering: {
    identifier: 'bplan_web',
    id: 'ofrng560c7ad85b',
    packages: {
      monthly: '$rc_monthly',
      annual: '$rc_annual',
    },
  },
  products: {
    monthly: {
      id: 'bplan_pro_monthly',
      interval: 'monthly',
    },
    annual: {
      id: 'bplan_pro_yearly',
      interval: 'annual',
    },
  },
} as const;

export type BillingPlan = keyof typeof BILLING_CONTRACT.products;

/** Values safe to expose to a browser bundle when their app contract allows it. */
export const BROWSER_SAFE_ENVIRONMENT_VARIABLES = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_REVENUECAT_WEB_PURCHASE_URL',
  'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
] as const;

/** Values that must remain in a server/tooling secret store. */
export const PRIVILEGED_ENVIRONMENT_VARIABLES = [
  'REVENUECAT_API_KEY',
  'REVENUECAT_MUTATION_API_KEY',
  'BILLING_SUPABASE_SERVICE_ROLE_KEY',
  'REVENUECAT_WEBHOOK_SECRET',
  'STRIPE_SECRET_KEY',
] as const;

/** Values that are not API secrets but must still be omitted from normal output. */
export const REDACTED_OUTPUT_ENVIRONMENT_VARIABLES = [
  ...PRIVILEGED_ENVIRONMENT_VARIABLES,
  'BILLING_REVENUECAT_SANDBOX_PURCHASE_URL',
] as const;

/**
 * REVENUECAT_API_KEY is the key every observational command uses and should be
 * provisioned read-only. A write-capable key has its own name and is accepted
 * only by the explicitly authorized sandbox-cancel mode, which also refuses a
 * mutation key equal to the read key. The loader cannot inspect a key's
 * RevenueCat permissions; keeping the names separate is what lets an operator
 * provision the read key without write scope.
 */
export const LIVE_READ_ONLY_REQUIRED_ENVIRONMENT_VARIABLES = [
  'REVENUECAT_API_KEY',
  'BILLING_SUPABASE_URL',
  'BILLING_SUPABASE_SERVICE_ROLE_KEY',
] as const;

export const MUTATION_API_KEY_VARIABLE = 'REVENUECAT_MUTATION_API_KEY' as const;
