import {
  BILLING_CONTRACT,
  LIVE_READ_ONLY_REQUIRED_ENVIRONMENT_VARIABLES,
  MUTATION_API_KEY_VARIABLE,
  REDACTED_OUTPUT_ENVIRONMENT_VARIABLES,
  REVENUECAT_API_BASE_URL,
} from './contract';

export type BillingAutomationMode =
  'offline' | 'live-readonly' | 'sandbox-checkout-probe' | 'sandbox-purchase' | 'sandbox-cancel';
export type BillingTargetEnvironment = 'sandbox' | 'production';

export type EnvironmentRecord = Readonly<Record<string, string | undefined>>;

export interface BillingEnvironmentConfig {
  mode: BillingAutomationMode;
  targetEnvironment: BillingTargetEnvironment;
  revenueCatApiKey?: string;
  /** Only ever set in sandbox-cancel mode. */
  revenueCatMutationApiKey?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  testUserId?: string;
}

export interface BillingConfigIssue {
  code:
    | 'INVALID_VALUE'
    | 'MISSING_VALUE'
    | 'INVALID_URL'
    | 'INVALID_UUID'
    | 'MUTATION_KEY_NOT_ALLOWED'
    | 'MUTATION_KEY_REUSED';
  variable: string;
  message: string;
}

export interface BillingEnvironmentLoad {
  config: BillingEnvironmentConfig;
  issues: BillingConfigIssue[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODES: readonly BillingAutomationMode[] = [
  'offline',
  'live-readonly',
  'sandbox-checkout-probe',
  'sandbox-purchase',
  'sandbox-cancel',
];
const TARGET_ENVIRONMENTS: readonly BillingTargetEnvironment[] = ['sandbox', 'production'];

export function isBillingUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function loadBillingEnvironment(raw: EnvironmentRecord): BillingEnvironmentLoad {
  const issues: BillingConfigIssue[] = [];
  const rawMode = optionalValue(raw.BILLING_AUTOMATION_MODE) ?? 'offline';
  const rawTarget = optionalValue(raw.BILLING_AUTOMATION_ENV) ?? 'sandbox';

  const mode = parseEnum(rawMode, MODES, 'BILLING_AUTOMATION_MODE', issues, 'mode');
  const targetEnvironment = parseEnum(
    rawTarget,
    TARGET_ENVIRONMENTS,
    'BILLING_AUTOMATION_ENV',
    issues,
    'target environment',
  );

  const revenueCatApiKey = optionalValue(raw.REVENUECAT_API_KEY);
  const supabaseUrl = optionalValue(raw.BILLING_SUPABASE_URL);
  const supabaseServiceRoleKey = optionalValue(raw.BILLING_SUPABASE_SERVICE_ROLE_KEY);
  const testUserId = optionalValue(raw.BILLING_TEST_USER_ID);

  if (mode === 'live-readonly' || mode === 'sandbox-purchase' || mode === 'sandbox-cancel') {
    for (const variable of LIVE_READ_ONLY_REQUIRED_ENVIRONMENT_VARIABLES) {
      if (!optionalValue(raw[variable])) {
        issues.push({
          code: 'MISSING_VALUE',
          variable,
          message: `${variable} is required for ${mode} mode.`,
        });
      }
    }
  }

  if (supabaseUrl && !isAllowedSupabaseUrl(supabaseUrl)) {
    issues.push({
      code: 'INVALID_URL',
      variable: 'BILLING_SUPABASE_URL',
      message: 'BILLING_SUPABASE_URL must use HTTPS, or localhost for local development.',
    });
  }

  const configuredApiBase = optionalValue(raw.REVENUECAT_API_BASE_URL);
  if (configuredApiBase && configuredApiBase !== REVENUECAT_API_BASE_URL) {
    issues.push({
      code: 'INVALID_URL',
      variable: 'REVENUECAT_API_BASE_URL',
      message: `REVENUECAT_API_BASE_URL must equal ${REVENUECAT_API_BASE_URL}.`,
    });
  }

  if (testUserId && !isBillingUserId(testUserId)) {
    issues.push({
      code: 'INVALID_UUID',
      variable: 'BILLING_TEST_USER_ID',
      message: 'BILLING_TEST_USER_ID must be a UUID; do not use an email or display name.',
    });
  }

  // The write-capable key exists only for the one-shot sandbox cancellation.
  const mutationApiKey = optionalValue(raw[MUTATION_API_KEY_VARIABLE]);
  if (mode === 'sandbox-cancel') {
    if (!mutationApiKey) {
      issues.push({
        code: 'MISSING_VALUE',
        variable: MUTATION_API_KEY_VARIABLE,
        message: `${MUTATION_API_KEY_VARIABLE} is required for sandbox-cancel mode.`,
      });
    } else if (mutationApiKey === revenueCatApiKey) {
      issues.push({
        code: 'MUTATION_KEY_REUSED',
        variable: MUTATION_API_KEY_VARIABLE,
        message: `${MUTATION_API_KEY_VARIABLE} must be a different key from the read-only REVENUECAT_API_KEY.`,
      });
    }
  } else if (mutationApiKey) {
    issues.push({
      code: 'MUTATION_KEY_NOT_ALLOWED',
      variable: MUTATION_API_KEY_VARIABLE,
      message: `${MUTATION_API_KEY_VARIABLE} is only accepted in sandbox-cancel mode.`,
    });
  }

  return {
    config: {
      mode,
      targetEnvironment,
      revenueCatApiKey,
      ...(mode === 'sandbox-cancel' && mutationApiKey
        ? { revenueCatMutationApiKey: mutationApiKey }
        : {}),
      supabaseUrl,
      supabaseServiceRoleKey,
      testUserId,
    },
    issues,
  };
}

export function formatBillingConfigIssues(
  issues: readonly BillingConfigIssue[],
  raw: EnvironmentRecord = {},
): string {
  if (issues.length === 0) return 'No configuration issues.';

  const text = issues.map((issue) => `${issue.variable}: ${issue.message}`).join('\n');
  return redactSecrets(text, raw);
}

/** Redacts both known secret values and simple NAME=value diagnostics. */
export function redactSecrets(text: string, raw: EnvironmentRecord = {}): string {
  let redacted = text;

  for (const variable of REDACTED_OUTPUT_ENVIRONMENT_VARIABLES) {
    const value = optionalValue(raw[variable]);
    if (value) redacted = redacted.split(value).join('[REDACTED]');
    redacted = redacted.replace(new RegExp(`${variable}=[^\\s]+`, 'g'), `${variable}=[REDACTED]`);
  }

  return redacted;
}

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  variable: string,
  issues: BillingConfigIssue[],
  label: string,
): T {
  if (allowed.includes(value as T)) return value as T;

  issues.push({
    code: 'INVALID_VALUE',
    variable,
    message: `${label} must be one of: ${allowed.join(', ')}.`,
  });
  return allowed[0] as T;
}

function isAllowedSupabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:') return true;
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

// Keep the contract imported in this module so the loader's safety checks and
// the static contract remain visibly coupled to one source of truth.
export const BILLING_ENTITLEMENT = BILLING_CONTRACT.entitlement;
