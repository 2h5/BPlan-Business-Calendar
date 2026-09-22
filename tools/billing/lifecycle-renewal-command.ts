import { isBillingUserId, loadBillingEnvironment, type EnvironmentRecord } from './config';
import {
  inspectAnnualLifecycle,
  inspectAnnualRenewal,
  type AnnualRenewalReport,
} from './lifecycle';
import { createRevenueCatAssertionAdapter } from './revenuecat-assertions';
import { createSupabaseAssertionAdapter } from './supabase-assertions';

const POLL_INTERVAL_MS = 30_000;
const CONVERGENCE_MS = 5 * 60_000;
const MAX_AFTER_ORIGINAL_END_MS = 10 * 60_000;
const BOUNDARY_GRACE_MS = 60_000;

/** The provider may briefly report a transitional state at the period boundary. */
export function isStablePreRenewalWindow(now: number, originalEnd: number): boolean {
  return now < originalEnd - BOUNDARY_GRACE_MS;
}

function format(report: AnnualRenewalReport): string {
  return [
    'RevenueCat annual natural renewal (read-only)',
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Product: ${report.storeIdentifier ?? 'UNKNOWN'}`,
    `Renewal state: ${report.autoRenewalStatus ?? 'UNKNOWN'}`,
    `Original period: ${report.originalPeriodStartsAt ?? 'UNKNOWN'} to ${report.originalPeriodEndsAt ?? 'UNKNOWN'}`,
    `Renewed period: ${report.renewedPeriodStartsAt ?? 'UNKNOWN'} to ${report.renewedPeriodEndsAt ?? 'UNKNOWN'}`,
    `RevenueCat Pro: ${report.providerPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Supabase mirror: ${report.mirrorPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Server authorization: ${report.serverPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Ledger transitions: ${report.ledgerTransitions.join(' > ') || 'NONE'}`,
    `Skipped ledger events: ${report.skippedLedgerEvents}`,
    `Stale ledger events: ${report.staleLedgerEvents}`,
    `Duplicate ledger events: ${report.duplicateLedgerEvents}`,
    ...(report.failure ? [`Failure: ${report.failure}`] : []),
  ].join('\n');
}

/** One bounded observation; this command never submits a provider or database write. */
export async function runBillingAnnualRenewalReadOnly(
  environment: EnvironmentRecord = process.env,
  write: (value: string) => void = (value) => process.stdout.write(`${value}\n`),
): Promise<number> {
  const { config, issues } = loadBillingEnvironment(environment);
  const header = 'RevenueCat annual natural renewal (read-only)';
  if (
    issues.length > 0 ||
    config.mode !== 'live-readonly' ||
    config.targetEnvironment !== 'sandbox' ||
    !config.testUserId ||
    !isBillingUserId(config.testUserId) ||
    !config.revenueCatApiKey ||
    !config.supabaseUrl ||
    !config.supabaseServiceRoleKey
  ) {
    write(`${header}\nResult: FAIL\nFailure: CONFIGURATION`);
    return 1;
  }
  const revenueCat = createRevenueCatAssertionAdapter({ apiKey: config.revenueCatApiKey });
  const supabase = createSupabaseAssertionAdapter({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  });
  const userId = config.testUserId;
  const initialProvider = await revenueCat.readUser(userId);
  if (!initialProvider.ok) {
    write(`${header}\nResult: FAIL\nFailure: ${initialProvider.error.code}`);
    return 1;
  }
  const initialSupabase = await supabase.readUser(userId);
  if (!initialSupabase.ok) {
    write(`${header}\nResult: FAIL\nFailure: ${initialSupabase.error.code}`);
    return 1;
  }
  const initialNow = new Date();
  const initial = inspectAnnualLifecycle(initialProvider.data, initialSupabase.data, initialNow);
  if (
    !initial.ok ||
    initial.state !== 'active' ||
    initial.renewed ||
    initial.cancelled ||
    initial.autoRenewalStatus !== 'will_renew' ||
    initial.ledgerTransitions.join('>') !== 'INITIAL_PURCHASE' ||
    !initial.periodEndsAt
  ) {
    write(`${header}\nResult: FAIL\nFailure: RENEWAL_INITIAL_STATE`);
    return 1;
  }
  write(
    `${header}\nInitial: PASS\nOriginal period: ${initial.periodStartsAt} to ${initial.periodEndsAt}`,
  );
  const originalEnd = Date.parse(initial.periodEndsAt);
  let firstAdvancedAt: number | undefined;
  while (Date.now() <= originalEnd + MAX_AFTER_ORIGINAL_END_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const provider = await revenueCat.readUser(userId);
    const mirror = await supabase.readUser(userId);
    if (!provider.ok || !mirror.ok) {
      write(
        `${header}\nResult: FAIL\nFailure: ${!provider.ok ? provider.error.code : !mirror.ok ? mirror.error.code : 'READ_FAILED'}`,
      );
      return 1;
    }
    const now = new Date();
    const currentSub = provider.data.subscriptions[0];
    if (
      provider.data.projectId !== initialProvider.data.projectId ||
      provider.data.customerId !== initialProvider.data.customerId ||
      provider.data.subscriptions.length !== 1 ||
      !currentSub ||
      currentSub?.id !== initialProvider.data.subscriptions[0]?.id ||
      currentSub?.productId !== initialProvider.data.subscriptions[0]?.productId
    ) {
      write(`${header}\nResult: FAIL\nFailure: RENEWAL_IDENTITY`);
      return 1;
    }
    const advanced =
      currentSub.currentPeriodEndsAt !== null && currentSub.currentPeriodEndsAt > originalEnd;
    if (advanced) {
      firstAdvancedAt ??= now.getTime();
      const report = inspectAnnualRenewal(
        initialProvider.data,
        initialSupabase.data,
        provider.data,
        mirror.data,
        initialNow,
        now,
      );
      if (report.ok) {
        write(format(report));
        return 0;
      }
      if (now.getTime() - firstAdvancedAt >= CONVERGENCE_MS) {
        write(format(report));
        return 1;
      }
    } else if (
      isStablePreRenewalWindow(now.getTime(), originalEnd) &&
      !inspectAnnualLifecycle(provider.data, mirror.data, now).ok
    ) {
      write(`${header}\nResult: FAIL\nFailure: RENEWAL_PRE_BOUNDARY_AUTHORITY`);
      return 1;
    } else if (
      isStablePreRenewalWindow(now.getTime(), originalEnd) &&
      (currentSub.status !== 'active' || currentSub.autoRenewalStatus !== 'will_renew')
    ) {
      write(`${header}\nResult: FAIL\nFailure: RENEWAL_PROVIDER_STATE`);
      return 1;
    }
  }
  write(`${header}\nResult: FAIL\nFailure: RENEWAL_NOT_OBSERVED`);
  return 1;
}
