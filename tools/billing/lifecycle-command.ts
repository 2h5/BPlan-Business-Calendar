import type { BillingAssertionFailure, BillingAssertionResult } from './assertion-types';
import { isBillingUserId, loadBillingEnvironment, type EnvironmentRecord } from './config';
import type { BillingPlan } from './contract';
import {
  formatLifecycleReport,
  inspectLifecycle,
  lifecycleHeader,
  parseLifecyclePlan,
} from './lifecycle';
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

type LifecycleStageUnexpectedFailureCode =
  | 'LIFECYCLE_PROVIDER_UNEXPECTED'
  | 'LIFECYCLE_SUPABASE_UNEXPECTED'
  | 'LIFECYCLE_RECONCILIATION_UNEXPECTED';

interface LifecycleCommandDependencies {
  readonly readProvider?: RevenueCatAssertionAdapter['readUser'];
  readonly readSupabase?: SupabaseAssertionAdapter['readUser'];
  readonly inspect?: typeof inspectLifecycle;
  readonly formatReport?: typeof formatLifecycleReport;
  readonly now?: () => Date;
}

export async function runBillingLifecycleReadOnly(
  argv: readonly string[] = process.argv.slice(2),
  environment: EnvironmentRecord = process.env,
  write: (value: string) => void = (value) => process.stdout.write(`${value}\n`),
  dependencies: LifecycleCommandDependencies = {},
): Promise<number> {
  const plan = parseLifecyclePlan(argv);
  if (!plan) {
    write(`${lifecycleHeader(null)}\nResult: FAIL\nFailure: ARGUMENT_INVALID`);
    return 1;
  }
  const loaded = loadBillingEnvironment(environment);
  const config = loaded.config;
  if (
    loaded.issues.length > 0 ||
    config.mode !== 'live-readonly' ||
    config.targetEnvironment !== 'sandbox' ||
    !config.testUserId ||
    !isBillingUserId(config.testUserId) ||
    !config.revenueCatApiKey ||
    !config.supabaseUrl ||
    !config.supabaseServiceRoleKey
  ) {
    write(`${lifecycleHeader(plan)}\nResult: FAIL\nFailure: CONFIGURATION`);
    return 1;
  }

  let provider: BillingAssertionResult<RevenueCatUserSnapshot>;
  try {
    const readProvider =
      dependencies.readProvider ??
      createRevenueCatAssertionAdapter({ apiKey: config.revenueCatApiKey }).readUser;
    provider = await readProvider(config.testUserId);
  } catch {
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_PROVIDER_UNEXPECTED', plan));
    return 1;
  }
  if (!provider.ok) {
    write(formatLifecycleReadOnlyFailure(provider.error, plan));
    return 1;
  }
  let supabase: BillingAssertionResult<SupabaseUserSnapshot>;
  try {
    const readSupabase =
      dependencies.readSupabase ??
      createSupabaseAssertionAdapter({
        url: config.supabaseUrl,
        serviceRoleKey: config.supabaseServiceRoleKey,
      }).readUser;
    supabase = await readSupabase(config.testUserId);
  } catch {
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_SUPABASE_UNEXPECTED', plan));
    return 1;
  }
  if (!supabase.ok) {
    write(`${lifecycleHeader(plan)}\nResult: FAIL\nFailure: ${supabase.error.code}`);
    return 1;
  }
  let report: ReturnType<typeof inspectLifecycle>;
  try {
    report = (dependencies.inspect ?? inspectLifecycle)(
      plan,
      provider.data,
      supabase.data,
      (dependencies.now ?? (() => new Date()))(),
    );
  } catch {
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_RECONCILIATION_UNEXPECTED', plan));
    return 1;
  }
  let formattedReport: string;
  try {
    formattedReport = (dependencies.formatReport ?? formatLifecycleReport)(report);
  } catch {
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_RECONCILIATION_UNEXPECTED', plan));
    return 1;
  }
  write(formattedReport);
  return report.ok ? 0 : 1;
}

export function formatLifecycleReadOnlyFailure(
  error: BillingAssertionFailure,
  plan: BillingPlan | null,
): string {
  const operation =
    error.providerOperation === undefined
      ? ''
      : `\nRevenueCat operation: ${error.providerOperation}`;
  return `${lifecycleHeader(plan)}\nResult: FAIL\nFailure: ${error.code}${operation}`;
}

export function formatLifecycleUnexpectedFailure(plan: BillingPlan | null): string {
  return `${lifecycleHeader(plan)}\nResult: FAIL\nFailure: LIFECYCLE_UNEXPECTED`;
}

export function formatLifecycleStageUnexpectedFailure(
  code: LifecycleStageUnexpectedFailureCode,
  plan: BillingPlan | null,
): string {
  return `${lifecycleHeader(plan)}\nResult: FAIL\nFailure: ${code}`;
}
