import { isBillingUserId, loadBillingEnvironment, type EnvironmentRecord } from './config';
import { BILLING_CONTRACT } from './contract';
import { inspectAnnualLifecycle, type LifecycleReport } from './lifecycle';
import {
  createRevenueCatAssertionAdapter,
  type RevenueCatUserSnapshot,
} from './revenuecat-assertions';
import { cancelRevenueCatSandboxSubscriptionOnce } from './revenuecat-cli';
import { createSupabaseAssertionAdapter } from './supabase-assertions';

export function cancellationGuard(
  report: LifecycleReport,
  provider: RevenueCatUserSnapshot,
  configuredUserId: string,
): string | null {
  const subscription = provider.subscriptions[0];
  if (!report.ok || report.state !== 'active') return report.failure ?? 'NOT_ACTIVE';
  if (!isBillingUserId(configuredUserId) || provider.customerId !== configuredUserId)
    return 'CUSTOMER_IDENTITY';
  if (
    !provider.projectId ||
    !provider.customerExists ||
    provider.subscriptions.length !== 1 ||
    !subscription
  )
    return 'CARDINALITY';
  if (
    subscription.environment !== 'sandbox' ||
    subscription.store !== 'rc_billing' ||
    subscription.storeIdentifier !== BILLING_CONTRACT.products.annual.id ||
    subscription.status !== 'active' ||
    !subscription.givesAccess ||
    !subscription.grantsPro ||
    subscription.autoRenewalStatus !== 'will_renew' ||
    !report.providerPro ||
    !report.mirrorPro ||
    !report.serverPro ||
    report.cancelled
  )
    return 'CANCELLATION_GUARD';
  return null;
}

export async function runSandboxCancellation(
  environment: EnvironmentRecord = process.env,
  write: (value: string) => void = (value) => process.stdout.write(`${value}\n`),
  dependencies: {
    readProvider?: ReturnType<typeof createRevenueCatAssertionAdapter>['readUser'];
    readSupabase?: ReturnType<typeof createSupabaseAssertionAdapter>['readUser'];
    cancel?: typeof cancelRevenueCatSandboxSubscriptionOnce;
    now?: () => Date;
  } = {},
): Promise<number> {
  const { config, issues } = loadBillingEnvironment(environment);
  const fail = (code: string): number => {
    write(`RevenueCat sandbox cancellation\nResult: FAIL\nFailure: ${code}`);
    return 1;
  };
  if (
    issues.length ||
    config.mode !== 'sandbox-cancel' ||
    config.targetEnvironment !== 'sandbox' ||
    !config.testUserId ||
    !isBillingUserId(config.testUserId) ||
    !config.revenueCatApiKey ||
    !config.supabaseUrl ||
    !config.supabaseServiceRoleKey
  )
    return fail('CONFIGURATION');

  const readProvider =
    dependencies.readProvider ??
    createRevenueCatAssertionAdapter({ apiKey: config.revenueCatApiKey }).readUser;
  const readSupabase =
    dependencies.readSupabase ??
    createSupabaseAssertionAdapter({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
    }).readUser;
  const provider = await readProvider(config.testUserId);
  if (!provider.ok) return fail(provider.error.code);
  const supabase = await readSupabase(config.testUserId);
  if (!supabase.ok) return fail(supabase.error.code);
  const report = inspectAnnualLifecycle(
    provider.data,
    supabase.data,
    (dependencies.now ?? (() => new Date()))(),
  );
  const guard = cancellationGuard(report, provider.data, config.testUserId);
  if (guard) return fail(guard);

  // Re-read immediately before submitting. Any state or identity drift fails closed.
  const latest = await readProvider(config.testUserId);
  if (!latest.ok) return fail(latest.error.code);
  const firstSubscription = provider.data.subscriptions[0];
  const latestSubscription = latest.data.subscriptions[0];
  if (
    !firstSubscription ||
    !latestSubscription ||
    latest.data.projectId !== provider.data.projectId ||
    latest.data.customerId !== provider.data.customerId ||
    latestSubscription.id !== firstSubscription.id ||
    latestSubscription.productId !== firstSubscription.productId ||
    latestSubscription.currentPeriodEndsAt !== firstSubscription.currentPeriodEndsAt ||
    latestSubscription.autoRenewalStatus !== 'will_renew' ||
    latestSubscription.status !== 'active' ||
    !latestSubscription.givesAccess ||
    !latest.data.activePro ||
    latest.data.subscriptions.length !== 1
  )
    return fail('STATE_CHANGED');

  // Exactly one submission. A failed or ambiguous CLI result is never retried.
  const cancel = dependencies.cancel ?? cancelRevenueCatSandboxSubscriptionOnce;
  const result = await cancel(
    provider.data.projectId as Parameters<typeof cancel>[0],
    firstSubscription.id,
    { apiKey: config.revenueCatApiKey },
  );
  write(
    `RevenueCat sandbox cancellation\nSubmission: ONE\nResult: ${result.ok ? 'SUBMITTED' : 'AMBIGUOUS_OR_FAILED'}${result.ok ? '' : `\nFailure: ${result.error.code}`}`,
  );
  return result.ok ? 0 : 1;
}
