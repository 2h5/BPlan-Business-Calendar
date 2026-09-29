import { isBillingUserId, loadBillingEnvironment, type EnvironmentRecord } from './config';
import type { BillingPlan } from './contract';
import {
  inspectLifecycle,
  inspectRenewal,
  isRenewalObservationStart,
  parseLifecyclePlan,
  type RenewalReport,
} from './lifecycle';
import {
  createRevenueCatAssertionAdapter,
  type RevenueCatAssertionAdapter,
} from './revenuecat-assertions';
import {
  createSupabaseAssertionAdapter,
  type SupabaseAssertionAdapter,
} from './supabase-assertions';

interface RenewalObservationTiming {
  readonly pollIntervalMs: number;
  /** How long authorities may take to agree after the provider period first advances. */
  readonly convergenceMs: number;
  /** How long after the original period end a renewal may still first appear. */
  readonly maxAfterOriginalEndMs: number;
  /** The provider may briefly report a transitional state this close to the boundary. */
  readonly boundaryGraceMs: number;
}

/**
 * RevenueCat sandbox periods are accelerated: an annual period lasts about an
 * hour and a monthly period a few minutes. Monthly windows stay shorter than
 * one period so a second renewal cannot land inside a single observation.
 */
export const RENEWAL_OBSERVATION_TIMING: Readonly<Record<BillingPlan, RenewalObservationTiming>> = {
  annual: {
    pollIntervalMs: 30_000,
    convergenceMs: 5 * 60_000,
    maxAfterOriginalEndMs: 10 * 60_000,
    boundaryGraceMs: 60_000,
  },
  monthly: {
    pollIntervalMs: 10_000,
    convergenceMs: 2 * 60_000,
    maxAfterOriginalEndMs: 2 * 60_000,
    boundaryGraceMs: 30_000,
  },
};

/** The provider may briefly report a transitional state at the period boundary. */
export function isStablePreRenewalWindow(
  now: number,
  originalEnd: number,
  boundaryGraceMs: number,
): boolean {
  return now < originalEnd - boundaryGraceMs;
}

export function renewalHeader(plan: BillingPlan | null): string {
  return plan
    ? `RevenueCat ${plan} natural renewal (read-only)`
    : 'RevenueCat natural renewal (read-only)';
}

function format(report: RenewalReport): string {
  return [
    renewalHeader(report.plan),
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    `Product: ${report.storeIdentifier ?? 'UNKNOWN'}`,
    `Renewal state: ${report.autoRenewalStatus ?? 'UNKNOWN'}`,
    `Original period: ${report.originalPeriodStartsAt ?? 'UNKNOWN'} to ${report.originalPeriodEndsAt ?? 'UNKNOWN'}`,
    `Renewed period: ${report.renewedPeriodStartsAt ?? 'UNKNOWN'} to ${report.renewedPeriodEndsAt ?? 'UNKNOWN'}`,
    `RevenueCat Pro: ${report.providerPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Supabase mirror: ${report.mirrorPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Server authorization: ${report.serverPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Applied lifecycle transitions: ${report.ledgerTransitions.join(' > ') || 'NONE'}`,
    `Unapplied ledger events (stale, deferred, ignored): ${report.skippedLedgerEvents}`,
    `Stale ledger events: ${report.staleLedgerEvents}`,
    `Duplicate deliveries (recorded since 2026-09-24): ${report.duplicateLedgerEvents}`,
    ...(report.failure ? [`Failure: ${report.failure}`] : []),
  ].join('\n');
}

interface RenewalCommandDependencies {
  readonly readProvider?: RevenueCatAssertionAdapter['readUser'];
  readonly readSupabase?: SupabaseAssertionAdapter['readUser'];
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** One bounded observation; this command never submits a provider or database write. */
export async function runBillingRenewalReadOnly(
  argv: readonly string[] = process.argv.slice(2),
  environment: EnvironmentRecord = process.env,
  write: (value: string) => void = (value) => process.stdout.write(`${value}\n`),
  dependencies: RenewalCommandDependencies = {},
): Promise<number> {
  const clock = dependencies.now ?? Date.now;
  const sleep =
    dependencies.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const plan = parseLifecyclePlan(argv);
  if (!plan) {
    write(`${renewalHeader(null)}\nResult: FAIL\nFailure: ARGUMENT_INVALID`);
    return 1;
  }
  const { config, issues } = loadBillingEnvironment(environment);
  const header = renewalHeader(plan);
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
  const timing = RENEWAL_OBSERVATION_TIMING[plan];
  const readProvider =
    dependencies.readProvider ??
    createRevenueCatAssertionAdapter({ apiKey: config.revenueCatApiKey }).readUser;
  const readSupabase =
    dependencies.readSupabase ??
    createSupabaseAssertionAdapter({
      url: config.supabaseUrl,
      serviceRoleKey: config.supabaseServiceRoleKey,
    }).readUser;
  const userId = config.testUserId;
  const initialProvider = await readProvider(userId);
  if (!initialProvider.ok) {
    write(`${header}\nResult: FAIL\nFailure: ${initialProvider.error.code}`);
    return 1;
  }
  const initialSupabase = await readSupabase(userId);
  if (!initialSupabase.ok) {
    write(`${header}\nResult: FAIL\nFailure: ${initialSupabase.error.code}`);
    return 1;
  }
  const initialNow = new Date(clock());
  const initial = inspectLifecycle(plan, initialProvider.data, initialSupabase.data, initialNow);
  if (!isRenewalObservationStart(initial) || !initial.periodEndsAt) {
    write(`${header}\nResult: FAIL\nFailure: RENEWAL_INITIAL_STATE`);
    return 1;
  }
  write(
    `${header}\nInitial: PASS\nOriginal period: ${initial.periodStartsAt} to ${initial.periodEndsAt}`,
  );
  const originalEnd = Date.parse(initial.periodEndsAt);
  let firstAdvancedAt: number | undefined;
  // Once the period advances, the convergence window bounds the loop instead.
  while (firstAdvancedAt !== undefined || clock() <= originalEnd + timing.maxAfterOriginalEndMs) {
    await sleep(timing.pollIntervalMs);
    const provider = await readProvider(userId);
    const mirror = await readSupabase(userId);
    if (!provider.ok || !mirror.ok) {
      write(
        `${header}\nResult: FAIL\nFailure: ${!provider.ok ? provider.error.code : !mirror.ok ? mirror.error.code : 'READ_FAILED'}`,
      );
      return 1;
    }
    const now = new Date(clock());
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
    const stable = isStablePreRenewalWindow(now.getTime(), originalEnd, timing.boundaryGraceMs);
    if (advanced) {
      firstAdvancedAt ??= now.getTime();
      const report = inspectRenewal(
        plan,
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
      if (now.getTime() - firstAdvancedAt >= timing.convergenceMs) {
        write(format(report));
        return 1;
      }
    } else if (stable && !inspectLifecycle(plan, provider.data, mirror.data, now).ok) {
      write(`${header}\nResult: FAIL\nFailure: RENEWAL_PRE_BOUNDARY_AUTHORITY`);
      return 1;
    } else if (
      stable &&
      (currentSub.status !== 'active' || currentSub.autoRenewalStatus !== 'will_renew')
    ) {
      write(`${header}\nResult: FAIL\nFailure: RENEWAL_PROVIDER_STATE`);
      return 1;
    }
  }
  write(`${header}\nResult: FAIL\nFailure: RENEWAL_NOT_OBSERVED`);
  return 1;
}
