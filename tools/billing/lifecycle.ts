import { BILLING_CONTRACT } from './contract';
import type { RevenueCatUserSnapshot } from './revenuecat-assertions';
import type { SupabaseUserSnapshot } from './supabase-assertions';

export interface LifecycleReport {
  readonly ok: boolean;
  readonly state: 'active' | 'cancelled-active' | 'expired' | 'unknown';
  readonly renewed: boolean;
  readonly cancelled: boolean;
  readonly providerPro: boolean;
  readonly mirrorPro: boolean;
  readonly serverPro: boolean;
  readonly providerSubscriptionCount: number;
  readonly mirrorRowCount: number;
  readonly ledgerEventCount: number;
  readonly annualProductMatch: boolean;
  readonly latestAppliedLedgerEventType: string | null;
  readonly storeIdentifier: string | null;
  readonly subscriptionStatus: string | null;
  readonly givesAccess: boolean | null;
  readonly subscriptionGrantsPro: boolean | null;
  readonly periodStartsAt: string | null;
  readonly periodEndsAt: string | null;
  readonly endsAt: string | null;
  readonly autoRenewalStatus: string | null;
  /** Applied lifecycle events only; a stale or deferred delivery is not a transition. */
  readonly ledgerTransitions: readonly string[];
  /** Every unapplied ledger row: stale, deferred to reconciliation, or ignored. */
  readonly skippedLedgerEvents: number;
  readonly staleLedgerEvents: number;
  /** Redeliveries recorded by duplicate_deliveries, which starts at the 2026-09-24 migration. */
  readonly duplicateLedgerEvents: number;
  /** Who wrote the mirror's current state: a webhook event or a reconciliation snapshot. */
  readonly mirrorAuthority: 'webhook' | 'reconciliation' | null;
  readonly failure?: string;
}

const RENEWAL_STATES = new Set([
  'will_renew',
  'will_not_renew',
  'will_change_product',
  'will_pause',
  'requires_price_increase_consent',
  'has_already_renewed',
]);
const LIFECYCLE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'SUBSCRIPTION_EXTENDED',
]);

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Reconcile one annual sandbox subscription without changing provider or database state. */
export function inspectAnnualLifecycle(
  provider: RevenueCatUserSnapshot,
  supabase: SupabaseUserSnapshot,
  now: Date,
): LifecycleReport {
  const sub = provider.subscriptions[0];
  const row = supabase.mirrorRows[0];
  const events = [...supabase.ledgerRows].reverse();
  const transitions = events
    .filter((event) => event.applied && LIFECYCLE_EVENTS.has(event.event_type))
    .map((event) => event.event_type);
  const latestApplied = [...events].reverse().find((event) => event.applied);
  const renewed = transitions.includes('RENEWAL');
  const cancelled = transitions.includes('CANCELLATION');
  const base: LifecycleReport = {
    ok: false,
    state: 'unknown',
    renewed,
    cancelled,
    providerPro: provider.activePro,
    mirrorPro: supabase.activeMirror,
    serverPro: supabase.serverAuthorized,
    providerSubscriptionCount: provider.subscriptions.length,
    mirrorRowCount: supabase.mirrorRows.length,
    ledgerEventCount: events.length,
    annualProductMatch: sub?.storeIdentifier === BILLING_CONTRACT.products.annual.id,
    latestAppliedLedgerEventType: latestApplied?.event_type ?? null,
    storeIdentifier: sub?.storeIdentifier ?? null,
    subscriptionStatus: sub?.status ?? null,
    givesAccess: sub?.givesAccess ?? null,
    subscriptionGrantsPro: sub?.grantsPro ?? null,
    periodStartsAt: iso(sub?.currentPeriodStartsAt ?? null),
    periodEndsAt: iso(sub?.currentPeriodEndsAt ?? null),
    endsAt: iso(sub?.endsAt ?? null),
    autoRenewalStatus: sub?.autoRenewalStatus ?? null,
    ledgerTransitions: transitions,
    skippedLedgerEvents: events.filter((event) => !event.applied).length,
    staleLedgerEvents: events.filter(
      (event) => !event.applied && /stale|out.of.order/i.test(event.skipped_reason ?? ''),
    ).length,
    duplicateLedgerEvents: events.reduce(
      (total, event) => total + (event.duplicate_deliveries ?? 0),
      0,
    ),
    mirrorAuthority: latestApplied
      ? latestApplied.event_type === 'RECONCILIATION'
        ? 'reconciliation'
        : 'webhook'
      : null,
  };
  const fail = (code: string): LifecycleReport => ({ ...base, failure: code });

  if (provider.subscriptions.length !== 1 || supabase.mirrorRows.length !== 1 || !sub || !row) {
    return fail('LIFECYCLE_CARDINALITY');
  }
  if (
    !provider.customerExists ||
    sub.environment !== 'sandbox' ||
    sub.storeIdentifier !== BILLING_CONTRACT.products.annual.id ||
    row.provider !== 'revenuecat' ||
    row.entitlement !== BILLING_CONTRACT.entitlement
  ) {
    return fail('LIFECYCLE_IDENTITY');
  }
  if (
    sub.currentPeriodStartsAt === null ||
    sub.currentPeriodEndsAt === null ||
    sub.endsAt === null ||
    sub.currentPeriodStartsAt >= sub.currentPeriodEndsAt ||
    sub.endsAt < sub.currentPeriodEndsAt ||
    !sub.autoRenewalStatus ||
    !RENEWAL_STATES.has(sub.autoRenewalStatus)
  ) {
    return fail('LIFECYCLE_PROVIDER_MALFORMED');
  }
  if (!supabase.ledgerCoherent || events.length === 0) return fail('LIFECYCLE_LEDGER');
  if (!latestApplied || row.last_event_at !== latestApplied.event_at) {
    return fail('LIFECYCLE_LEDGER');
  }

  const active =
    sub.status === 'active' && sub.givesAccess && sub.currentPeriodEndsAt > now.getTime();
  const expired = sub.status === 'expired' && !sub.givesAccess && sub.endsAt <= now.getTime();
  if (!active && !expired) return fail('LIFECYCLE_PROVIDER_INCONSISTENT');
  if (active && !sub.grantsPro) return fail('LIFECYCLE_IDENTITY');
  // A webhook mirrors RevenueCat's end exactly. A reconciliation that expired
  // the row keeps that end when it records a lost EXPIRATION, or ends access
  // at its snapshot time when RevenueCat stopped granting earlier than the
  // mirror expected; either way access ended no earlier than RevenueCat's end
  // and no later than now.
  const mirrorExpiry = Date.parse(row.expires_at ?? '');
  const expiryAgrees =
    expired && base.mirrorAuthority === 'reconciliation'
      ? mirrorExpiry >= sub.endsAt && mirrorExpiry <= now.getTime()
      : mirrorExpiry === sub.endsAt;
  if (
    provider.activePro !== active ||
    supabase.activeMirror !== active ||
    supabase.serverAuthorized !== active ||
    row.status !== (active ? 'active' : 'expired') ||
    !expiryAgrees
  ) {
    return fail('LIFECYCLE_AUTHORITY_MISMATCH');
  }
  if (active && latestApplied.event_type === 'EXPIRATION') return fail('LIFECYCLE_LEDGER');
  if (
    expired &&
    latestApplied.event_type !== 'EXPIRATION' &&
    latestApplied.event_type !== 'RECONCILIATION'
  )
    return fail('LIFECYCLE_LEDGER');
  const latestRenewalDecision = [...events]
    .reverse()
    .find(
      (event) =>
        event.applied &&
        (event.event_type === 'CANCELLATION' || event.event_type === 'UNCANCELLATION'),
    );
  const cancellationCurrent =
    active &&
    sub.autoRenewalStatus === 'will_not_renew' &&
    latestRenewalDecision?.event_type === 'CANCELLATION';
  if (active && sub.autoRenewalStatus === 'will_not_renew' && !cancellationCurrent) {
    return fail('LIFECYCLE_CANCELLATION_UNPROVEN');
  }

  return {
    ...base,
    ok: true,
    state: expired ? 'expired' : cancellationCurrent ? 'cancelled-active' : 'active',
  };
}

export function formatLifecycleReport(report: LifecycleReport): string {
  return [
    'RevenueCat annual lifecycle (read-only)',
    `Result: ${report.ok ? 'PASS' : 'FAIL'}`,
    ...(report.failure ? [`Failure: ${report.failure}`] : []),
    `Provider subscriptions: ${report.providerSubscriptionCount}`,
    `Supabase mirror rows: ${report.mirrorRowCount}`,
    `Ledger events: ${report.ledgerEventCount}`,
    `Annual product match: ${report.annualProductMatch ? 'YES' : 'NO'}`,
    `State: ${report.state}`,
    `Product: ${report.storeIdentifier ?? 'UNKNOWN'}`,
    `Subscription status: ${report.subscriptionStatus ?? 'UNKNOWN'}`,
    `Subscription access: ${report.givesAccess === null ? 'UNKNOWN' : report.givesAccess ? 'ACTIVE' : 'INACTIVE'}`,
    `Subscription Pro attachment: ${report.subscriptionGrantsPro === null ? 'UNKNOWN' : report.subscriptionGrantsPro ? 'PRESENT' : 'ABSENT'}`,
    `Renewed: ${report.renewed ? 'YES' : 'NO'}`,
    `Cancellation applied: ${report.cancelled ? 'YES' : 'NO'}`,
    `RevenueCat Pro: ${report.providerPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Supabase mirror: ${report.mirrorPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Server authorization: ${report.serverPro ? 'ACTIVE' : 'INACTIVE'}`,
    `Period start: ${report.periodStartsAt ?? 'UNKNOWN'}`,
    `Period end: ${report.periodEndsAt ?? 'UNKNOWN'}`,
    `End: ${report.endsAt ?? 'UNKNOWN'}`,
    `Renewal state: ${report.autoRenewalStatus ?? 'UNKNOWN'}`,
    `Applied lifecycle transitions: ${report.ledgerTransitions.join(' > ') || 'NONE'}`,
    `Unapplied ledger events (stale, deferred, ignored): ${report.skippedLedgerEvents}`,
    `Stale ledger events: ${report.staleLedgerEvents}`,
    `Duplicate deliveries (recorded since 2026-09-24): ${report.duplicateLedgerEvents}`,
    `Latest applied ledger event: ${report.latestAppliedLedgerEventType ?? 'UNKNOWN'}`,
    `Mirror written by: ${report.mirrorAuthority ?? 'UNKNOWN'}`,
  ].join('\n');
}

export interface AnnualRenewalReport {
  readonly ok: boolean;
  readonly storeIdentifier: string | null;
  readonly autoRenewalStatus: string | null;
  readonly originalPeriodStartsAt: string | null;
  readonly originalPeriodEndsAt: string | null;
  readonly renewedPeriodStartsAt: string | null;
  readonly renewedPeriodEndsAt: string | null;
  readonly ledgerTransitions: readonly string[];
  readonly skippedLedgerEvents: number;
  readonly staleLedgerEvents: number;
  readonly duplicateLedgerEvents: number;
  readonly providerPro: boolean;
  readonly mirrorPro: boolean;
  readonly serverPro: boolean;
  readonly failure?: string;
}

/** Compare two read-only authority snapshots around one natural sandbox renewal. */
export function inspectAnnualRenewal(
  initialProvider: RevenueCatUserSnapshot,
  initialSupabase: SupabaseUserSnapshot,
  renewedProvider: RevenueCatUserSnapshot,
  renewedSupabase: SupabaseUserSnapshot,
  initialNow: Date,
  renewedNow: Date,
): AnnualRenewalReport {
  const initial = inspectAnnualLifecycle(initialProvider, initialSupabase, initialNow);
  const renewed = inspectAnnualLifecycle(renewedProvider, renewedSupabase, renewedNow);
  const before = initialProvider.subscriptions[0];
  const after = renewedProvider.subscriptions[0];
  const base: AnnualRenewalReport = {
    ok: false,
    storeIdentifier: renewed.storeIdentifier,
    autoRenewalStatus: renewed.autoRenewalStatus,
    originalPeriodStartsAt: initial.periodStartsAt,
    originalPeriodEndsAt: initial.periodEndsAt,
    renewedPeriodStartsAt: renewed.periodStartsAt,
    renewedPeriodEndsAt: renewed.periodEndsAt,
    ledgerTransitions: renewed.ledgerTransitions,
    skippedLedgerEvents: renewed.skippedLedgerEvents,
    staleLedgerEvents: renewed.staleLedgerEvents,
    duplicateLedgerEvents: renewed.duplicateLedgerEvents,
    providerPro: renewed.providerPro,
    mirrorPro: renewed.mirrorPro,
    serverPro: renewed.serverPro,
  };
  const fail = (failure: string): AnnualRenewalReport => ({ ...base, failure });
  if (
    !initial.ok ||
    initial.state !== 'active' ||
    initial.renewed ||
    initial.cancelled ||
    before?.autoRenewalStatus !== 'will_renew' ||
    initial.ledgerTransitions.join('>') !== 'INITIAL_PURCHASE'
  )
    return fail('RENEWAL_INITIAL_STATE');
  if (
    initialProvider.projectId !== renewedProvider.projectId ||
    initialProvider.customerId !== renewedProvider.customerId ||
    initialProvider.customerId !== initialSupabase.mirrorRows[0]?.user_id ||
    renewedProvider.customerId !== renewedSupabase.mirrorRows[0]?.user_id ||
    initialProvider.customerId !== initialSupabase.mirrorRows[0]?.raw_customer_id ||
    renewedProvider.customerId !== renewedSupabase.mirrorRows[0]?.raw_customer_id ||
    !before ||
    !after ||
    before.id !== after.id ||
    before.productId === null ||
    before.productId !== after.productId ||
    before.store !== 'rc_billing' ||
    after.store !== 'rc_billing'
  )
    return fail('RENEWAL_IDENTITY');
  if (
    !renewed.ok ||
    renewed.state !== 'active' ||
    after.autoRenewalStatus !== 'will_renew' ||
    !renewed.providerPro ||
    !renewed.mirrorPro ||
    !renewed.serverPro
  )
    return fail('RENEWAL_AUTHORITY');
  if (
    before.currentPeriodStartsAt === null ||
    before.currentPeriodEndsAt === null ||
    after.currentPeriodStartsAt === null ||
    after.currentPeriodEndsAt === null ||
    after.currentPeriodStartsAt < before.currentPeriodEndsAt ||
    after.currentPeriodEndsAt <= before.currentPeriodEndsAt ||
    Date.parse(renewedSupabase.mirrorRows[0]?.expires_at ?? '') !== after.currentPeriodEndsAt
  )
    return fail('RENEWAL_PERIOD');
  const applied = [...renewedSupabase.ledgerRows].reverse().filter((event) => event.applied);
  if (
    applied.length !== 2 ||
    applied[0]?.event_type !== 'INITIAL_PURCHASE' ||
    applied[1]?.event_type !== 'RENEWAL' ||
    Date.parse(applied[1].event_at) <= Date.parse(applied[0].event_at) ||
    initialSupabase.ledgerRows[0]?.event_id !== applied[0].event_id
  )
    return fail('RENEWAL_LEDGER');
  return { ...base, ok: true };
}
