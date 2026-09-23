import type { BillingAssertionFailure, BillingAssertionResult } from './assertion-types';
import { isBillingUserId, loadBillingEnvironment, type EnvironmentRecord } from './config';
import { formatLifecycleReport, inspectAnnualLifecycle } from './lifecycle';
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
  readonly inspect?: typeof inspectAnnualLifecycle;
  readonly formatReport?: typeof formatLifecycleReport;
  readonly now?: () => Date;
}

export async function runBillingLifecycleReadOnly(
  environment: EnvironmentRecord = process.env,
  write: (value: string) => void = (value) => process.stdout.write(`${value}\n`),
  dependencies: LifecycleCommandDependencies = {},
): Promise<number> {
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
    write('RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: CONFIGURATION');
    return 1;
  }

  let provider: BillingAssertionResult<RevenueCatUserSnapshot>;
  try {
    const readProvider =
      dependencies.readProvider ??
      createRevenueCatAssertionAdapter({ apiKey: config.revenueCatApiKey }).readUser;
    provider = await readProvider(config.testUserId);
  } catch {
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_PROVIDER_UNEXPECTED'));
    return 1;
  }
  if (!provider.ok) {
    write(formatLifecycleReadOnlyFailure(provider.error));
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
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_SUPABASE_UNEXPECTED'));
    return 1;
  }
  if (!supabase.ok) {
    write(`RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: ${supabase.error.code}`);
    return 1;
  }
  let report: ReturnType<typeof inspectAnnualLifecycle>;
  try {
    report = (dependencies.inspect ?? inspectAnnualLifecycle)(
      provider.data,
      supabase.data,
      (dependencies.now ?? (() => new Date()))(),
    );
  } catch {
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_RECONCILIATION_UNEXPECTED'));
    return 1;
  }
  let formattedReport: string;
  try {
    formattedReport = (dependencies.formatReport ?? formatLifecycleReport)(report);
  } catch {
    write(formatLifecycleStageUnexpectedFailure('LIFECYCLE_RECONCILIATION_UNEXPECTED'));
    return 1;
  }
  write(formattedReport);
  return report.ok ? 0 : 1;
}

export function formatLifecycleReadOnlyFailure(error: BillingAssertionFailure): string {
  const operation =
    error.providerOperation === undefined
      ? ''
      : `\nRevenueCat operation: ${error.providerOperation}`;
  return `RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: ${error.code}${operation}`;
}

export function formatLifecycleUnexpectedFailure(): string {
  return 'RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: LIFECYCLE_UNEXPECTED';
}

export function formatLifecycleStageUnexpectedFailure(
  code: LifecycleStageUnexpectedFailureCode,
): string {
  return `RevenueCat annual lifecycle (read-only)\nResult: FAIL\nFailure: ${code}`;
}
