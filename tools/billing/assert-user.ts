import {
  assertionFailure,
  type BillingAssertionCategory,
  type BillingAssertionFailure,
  type BillingAssertionResult,
} from './assertion-types';
import {
  isBillingUserId,
  loadBillingEnvironment,
  redactSecrets,
  type EnvironmentRecord,
} from './config';
import { BILLING_CONTRACT, type BillingPlan } from './contract';
import {
  createRevenueCatAssertionAdapter,
  type RevenueCatAssertionAdapter,
  type RevenueCatUserSnapshot,
} from './revenuecat-assertions';
import {
  createSupabaseAssertionAdapter,
  type SupabaseAssertionAdapter,
  type SupabaseUserSnapshot,
} from './supabase-assertions';

export type BillingExpectedState = 'active-pro' | 'free';
export type BillingAssertionCheckStatus = 'PASS' | 'FAIL';

export interface BillingUserAssertionCheck {
  readonly category: BillingAssertionCategory;
  readonly label: string;
  readonly status: BillingAssertionCheckStatus;
  readonly value: string;
  readonly message: string;
}

export interface BillingUserAssertionReport {
  readonly ok: boolean;
  readonly userId: string;
  readonly targetEnvironment: string;
  readonly expectedState: BillingExpectedState;
  readonly expectedPlan?: BillingPlan;
  readonly checks: readonly BillingUserAssertionCheck[];
  readonly failure?: BillingAssertionFailure;
}

export interface BillingAssertUserOptions {
  readonly environment?: EnvironmentRecord;
  readonly argv?: readonly string[];
  readonly revenueCat?: RevenueCatAssertionAdapter;
  readonly supabase?: SupabaseAssertionAdapter;
  readonly now?: () => Date;
  /** Internal orchestration hook; the standalone command always requires live-readonly. */
  readonly requiredMode?: 'live-readonly' | 'sandbox-purchase';
  /** Optional stricter purchase evidence check used by a plan-scoped E2E run. */
  readonly expectedPlan?: BillingPlan;
}

interface ParsedArguments {
  readonly userId?: string;
  readonly expectedState: BillingExpectedState;
  readonly expectedPlan?: BillingPlan;
}

function configurationFailure(
  code: string,
  message: string,
): BillingAssertionResult<ParsedArguments> {
  return assertionFailure('CONFIGURATION', code, message);
}

export function parseBillingAssertUserArguments(
  argv: readonly string[],
  environment: EnvironmentRecord,
): BillingAssertionResult<ParsedArguments> {
  let userId: string | undefined;
  let expectedState: BillingExpectedState = 'active-pro';
  let expectedPlan: BillingPlan | undefined;
  let sawUser = false;
  let sawExpectedState = false;
  let sawPlan = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--user') {
      if (sawUser) return configurationFailure('USER_ID_DUPLICATE', '--user may be supplied once.');
      sawUser = true;
      userId = argv[index + 1];
      index += 1;
      if (!userId) return configurationFailure('USER_ID_MISSING', '--user requires a UUID value.');
      continue;
    }
    if (argument === '--expect') {
      if (sawExpectedState) {
        return configurationFailure('EXPECTED_STATE_DUPLICATE', '--expect may be supplied once.');
      }
      sawExpectedState = true;
      const value = argv[index + 1];
      index += 1;
      if (value !== 'active-pro' && value !== 'free') {
        return configurationFailure(
          'EXPECTED_STATE_INVALID',
          '--expect must be one of: active-pro, free.',
        );
      }
      expectedState = value;
      continue;
    }
    if (argument === '--plan') {
      if (sawPlan) return configurationFailure('PLAN_DUPLICATE', '--plan may be supplied once.');
      sawPlan = true;
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        return configurationFailure('PLAN_MISSING', '--plan requires monthly or annual.');
      }
      index += 1;
      if (value !== 'monthly' && value !== 'annual') {
        return configurationFailure('PLAN_INVALID', '--plan must be one of: monthly, annual.');
      }
      expectedPlan = value;
      continue;
    }
    return configurationFailure('ARGUMENT_UNSUPPORTED', `Unsupported argument: ${argument ?? ''}.`);
  }

  if (expectedState === 'free' && expectedPlan) {
    return configurationFailure(
      'PLAN_NOT_ALLOWED_FOR_FREE',
      '--plan may only be used with --expect active-pro.',
    );
  }

  const selectedUserId = userId ?? environment.BILLING_TEST_USER_ID?.trim();
  if (!selectedUserId) {
    return configurationFailure(
      'USER_ID_MISSING',
      'Provide --user <uuid> or BILLING_TEST_USER_ID; a user is never selected implicitly.',
    );
  }
  if (!isBillingUserId(selectedUserId)) {
    return configurationFailure(
      'USER_ID_INVALID',
      'The billing assertion user must be a UUID; emails and display names are forbidden.',
    );
  }
  return { ok: true, data: { userId: selectedUserId, expectedState, expectedPlan } };
}

function failureReport(
  userId: string,
  expectedState: BillingExpectedState,
  targetEnvironment: string,
  error: BillingAssertionFailure,
  checks: readonly BillingUserAssertionCheck[] = [],
  expectedPlan?: BillingPlan,
): BillingUserAssertionReport {
  return {
    ok: false,
    userId,
    expectedState,
    targetEnvironment,
    expectedPlan,
    checks: [
      ...checks,
      {
        category: error.category,
        label: labelForCategory(error.category),
        status: 'FAIL',
        value: 'FAIL',
        message: error.message,
      },
    ],
    failure: error,
  };
}

function labelForCategory(category: BillingAssertionCategory): string {
  switch (category) {
    case 'CLI_VERSION':
      return 'RevenueCat CLI';
    case 'REVENUECAT_PROJECT':
      return 'RevenueCat project';
    case 'REVENUECAT_CUSTOMER':
      return 'RevenueCat customer';
    case 'REVENUECAT_ENTITLEMENT':
      return 'Pro entitlement';
    case 'REVENUECAT_SUBSCRIPTION':
      return 'Subscription';
    case 'SUPABASE_MIRROR':
      return 'Supabase mirror';
    case 'SUBSCRIPTION_LEDGER':
      return 'Subscription ledger';
    case 'SERVER_AUTHORIZATION':
      return 'Server authorization';
    case 'SAFETY':
      return 'Safety';
    case 'CONFIGURATION':
      return 'Configuration';
  }
}

function passCheck(
  category: BillingAssertionCategory,
  value: string,
  message: string,
): BillingUserAssertionCheck {
  return { category, label: labelForCategory(category), status: 'PASS', value, message };
}

function providerSupportsPro(snapshot: RevenueCatUserSnapshot): boolean {
  return (
    snapshot.subscriptions.some((item) => item.grantsPro && item.givesAccess) ||
    snapshot.purchases.some((item) => item.grantsPro && item.status.toLowerCase() === 'owned')
  );
}

function compareSnapshots(
  expectedState: BillingExpectedState,
  provider: RevenueCatUserSnapshot,
  supabase: SupabaseUserSnapshot,
  expectedPlan?: BillingPlan,
): BillingAssertionResult<readonly BillingUserAssertionCheck[]> {
  const supportsPro = providerSupportsPro(provider);
  const checks: BillingUserAssertionCheck[] = [
    passCheck('CLI_VERSION', 'PASS', 'The local RevenueCat CLI matches the approved version.'),
    passCheck(
      'REVENUECAT_PROJECT',
      'PASS',
      'Exactly one project matched the required name and its canonical ID scoped every read.',
    ),
  ];

  if (expectedState === 'active-pro') {
    if (!provider.customerExists) {
      return assertionFailure(
        'REVENUECAT_CUSTOMER',
        'REVENUECAT_CUSTOMER_ABSENT',
        'RevenueCat customer was absent while active Pro was expected.',
      );
    }
    checks.push(passCheck('REVENUECAT_CUSTOMER', 'PASS', 'The exact customer UUID exists.'));
    if (!provider.activePro) {
      return assertionFailure(
        'REVENUECAT_ENTITLEMENT',
        'REVENUECAT_PRO_INACTIVE',
        'RevenueCat does not report an active Pro entitlement.',
      );
    }
    checks.push(passCheck('REVENUECAT_ENTITLEMENT', 'ACTIVE', 'RevenueCat reports Pro active.'));
    if (!supportsPro) {
      return assertionFailure(
        'REVENUECAT_SUBSCRIPTION',
        'REVENUECAT_PRO_EVIDENCE_MISSING',
        'No sandbox subscription or purchase supports the active Pro entitlement.',
      );
    }
    if (expectedPlan) {
      const expectedProductId = BILLING_CONTRACT.products[expectedPlan].id;
      const expectedPlanSupportsPro =
        provider.subscriptions.some(
          (item) => item.grantsPro && item.givesAccess && item.productId === expectedProductId,
        ) ||
        provider.purchases.some(
          (item) =>
            item.grantsPro &&
            item.status.toLowerCase() === 'owned' &&
            item.productId === expectedProductId,
        );
      if (!expectedPlanSupportsPro) {
        return assertionFailure(
          'REVENUECAT_SUBSCRIPTION',
          'REVENUECAT_EXPECTED_PLAN_MISSING',
          'RevenueCat Pro evidence does not match the expected billing plan.',
        );
      }
    }
    checks.push(
      passCheck(
        'REVENUECAT_SUBSCRIPTION',
        'PASS',
        'Sandbox subscription or purchase evidence supports Pro access.',
      ),
    );
    if (!supabase.activeMirror) {
      return assertionFailure(
        'SUPABASE_MIRROR',
        'SUPABASE_ACTIVE_MIRROR_MISSING',
        'RevenueCat Pro is active but the Supabase mirror is not active.',
      );
    }
    checks.push(passCheck('SUPABASE_MIRROR', 'PASS', 'The RevenueCat Pro mirror is active.'));
    if (supabase.ledgerRows.length === 0) {
      return assertionFailure(
        'SUBSCRIPTION_LEDGER',
        'SUBSCRIPTION_LEDGER_EMPTY',
        'Active Pro has no subscription-event ledger evidence.',
      );
    }
    checks.push(
      passCheck(
        'SUBSCRIPTION_LEDGER',
        'PASS',
        'The event ledger is coherent and supports the mirror.',
      ),
    );
    if (!supabase.serverAuthorized) {
      return assertionFailure(
        'SERVER_AUTHORIZATION',
        'SERVER_AUTHORIZATION_FALSE',
        'Provider and mirror are active but has_active_entitlement returned false.',
      );
    }
    checks.push(passCheck('SERVER_AUTHORIZATION', 'PASS', 'has_active_entitlement returned true.'));
    return { ok: true, data: checks };
  }

  checks.push(
    passCheck(
      'REVENUECAT_CUSTOMER',
      provider.customerExists ? 'PASS' : 'ABSENT',
      provider.customerExists
        ? 'The exact customer UUID exists.'
        : 'No RevenueCat customer exists, which is valid for the expected free state.',
    ),
  );
  if (provider.activePro || supportsPro) {
    return assertionFailure(
      'REVENUECAT_ENTITLEMENT',
      'REVENUECAT_PRO_UNEXPECTED',
      'RevenueCat reports Pro access while the free state was expected.',
    );
  }
  checks.push(passCheck('REVENUECAT_ENTITLEMENT', 'INACTIVE', 'RevenueCat Pro is not active.'));
  checks.push(
    passCheck('REVENUECAT_SUBSCRIPTION', 'PASS', 'No sandbox resource grants Pro access.'),
  );
  if (supabase.activeMirror) {
    return assertionFailure(
      'SUPABASE_MIRROR',
      'SUPABASE_ACTIVE_MIRROR_UNEXPECTED',
      'Supabase reports active Pro while RevenueCat does not.',
    );
  }
  checks.push(passCheck('SUPABASE_MIRROR', 'PASS', 'The Supabase mirror does not grant Pro.'));
  checks.push(passCheck('SUBSCRIPTION_LEDGER', 'PASS', 'The event ledger is coherent.'));
  if (supabase.serverAuthorized) {
    return assertionFailure(
      'SERVER_AUTHORIZATION',
      'SERVER_AUTHORIZATION_TRUE_UNEXPECTED',
      'has_active_entitlement returned true for the expected free user.',
    );
  }
  checks.push(passCheck('SERVER_AUTHORIZATION', 'PASS', 'has_active_entitlement returned false.'));
  return { ok: true, data: checks };
}

export async function runBillingAssertUser(
  options: BillingAssertUserOptions = {},
): Promise<BillingUserAssertionReport> {
  const environment = options.environment ?? process.env;
  const argumentsResult = parseBillingAssertUserArguments(options.argv ?? [], environment);
  if (!argumentsResult.ok) {
    return failureReport('', 'active-pro', environment.BILLING_AUTOMATION_ENV ?? 'sandbox', {
      ...argumentsResult.error,
      message: redactSecrets(argumentsResult.error.message, environment),
    });
  }
  const { userId = '', expectedState, expectedPlan: parsedExpectedPlan } = argumentsResult.data;
  const expectedPlan = options.expectedPlan ?? parsedExpectedPlan;
  if (expectedState === 'free' && expectedPlan) {
    return failureReport(
      userId,
      expectedState,
      environment.BILLING_AUTOMATION_ENV ?? 'sandbox',
      {
        category: 'CONFIGURATION',
        code: 'PLAN_NOT_ALLOWED_FOR_FREE',
        message: '--plan may only be used with --expect active-pro.',
      },
      [],
      expectedPlan,
    );
  }
  const selectedEnvironment: EnvironmentRecord = {
    ...environment,
    BILLING_TEST_USER_ID: userId,
  };
  const loaded = loadBillingEnvironment(selectedEnvironment);
  if (loaded.issues.length > 0) {
    return failureReport(
      userId,
      expectedState,
      loaded.config.targetEnvironment,
      {
        category: 'CONFIGURATION',
        code: 'CONFIGURATION_INVALID',
        message: redactSecrets(
          loaded.issues.map((issue) => `${issue.variable}: ${issue.message}`).join(' '),
          selectedEnvironment,
        ),
      },
      [],
      expectedPlan,
    );
  }
  const requiredMode = options.requiredMode ?? 'live-readonly';
  if (loaded.config.mode !== requiredMode) {
    return failureReport(
      userId,
      expectedState,
      loaded.config.targetEnvironment,
      {
        category: 'SAFETY',
        code:
          requiredMode === 'live-readonly' ? 'LIVE_READONLY_REQUIRED' : 'SANDBOX_PURCHASE_REQUIRED',
        message: `Billing assertion requires BILLING_AUTOMATION_MODE=${requiredMode}.`,
      },
      [],
      expectedPlan,
    );
  }
  if (loaded.config.targetEnvironment !== 'sandbox') {
    return failureReport(
      userId,
      expectedState,
      loaded.config.targetEnvironment,
      {
        category: 'SAFETY',
        code: 'SANDBOX_REQUIRED',
        message: 'billing:assert-user is sandbox-only; production is forbidden.',
      },
      [],
      expectedPlan,
    );
  }

  const revenueCatApiKey = loaded.config.revenueCatApiKey;
  const supabaseUrl = loaded.config.supabaseUrl;
  const supabaseServiceRoleKey = loaded.config.supabaseServiceRoleKey;
  if (!revenueCatApiKey || !supabaseUrl || !supabaseServiceRoleKey) {
    return failureReport(
      userId,
      expectedState,
      loaded.config.targetEnvironment,
      {
        category: 'CONFIGURATION',
        code: 'CONFIGURATION_INCOMPLETE',
        message: 'Required live-readonly credentials are incomplete.',
      },
      [],
      expectedPlan,
    );
  }

  const revenueCat =
    options.revenueCat ??
    createRevenueCatAssertionAdapter({
      apiKey: revenueCatApiKey,
      parentEnvironment: environment,
      now: options.now,
    });
  const supabase =
    options.supabase ??
    createSupabaseAssertionAdapter({
      url: supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
      now: options.now,
    });

  const providerResult = await revenueCat.readUser(userId);
  if (!providerResult.ok) {
    return failureReport(
      userId,
      expectedState,
      'sandbox',
      {
        ...providerResult.error,
        message: redactSecrets(providerResult.error.message, environment),
      },
      [],
      expectedPlan,
    );
  }
  const supabaseResult = await supabase.readUser(userId);
  if (!supabaseResult.ok) {
    return failureReport(
      userId,
      expectedState,
      'sandbox',
      {
        ...supabaseResult.error,
        message: redactSecrets(supabaseResult.error.message, environment),
      },
      [],
      expectedPlan,
    );
  }
  const comparison = compareSnapshots(
    expectedState,
    providerResult.data,
    supabaseResult.data,
    expectedPlan,
  );
  if (!comparison.ok) {
    return failureReport(userId, expectedState, 'sandbox', comparison.error, [], expectedPlan);
  }

  return {
    ok: true,
    userId,
    targetEnvironment: 'sandbox',
    expectedState,
    expectedPlan,
    checks: comparison.data,
  };
}

function dotted(label: string, value: string): string {
  return `${label}${'.'.repeat(Math.max(1, 29 - label.length))} ${value}`;
}

export function formatBillingAssertUserReport(report: BillingUserAssertionReport): string {
  const lines = [
    'RevenueCat billing user assertion',
    '',
    dotted('User', report.userId || '(invalid)'),
    dotted('Target', report.targetEnvironment),
    dotted('Expected', report.expectedState),
    ...(report.expectedPlan ? [dotted('Expected plan', report.expectedPlan)] : []),
  ];
  for (const check of report.checks) lines.push(dotted(check.label, check.value));
  if (report.failure) {
    lines.push('');
    lines.push(`${report.failure.category}: ${report.failure.message}`);
  }
  lines.push('');
  lines.push(`Result: ${report.ok ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}
