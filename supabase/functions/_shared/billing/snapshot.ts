import type { RevenueCatEnvironment } from '@cal/schemas/subscription';

import type {
  ActiveEntitlement,
  CatalogEntitlement,
  CustomerPurchase,
  CustomerSubscription,
} from './revenuecat-api.ts';

/**
 * Turn RevenueCat customer state into a mirror snapshot. Pure.
 *
 * RevenueCat's `active_entitlements` answers "does this customer have access
 * now" but not "in which environment": RevenueCat has one customer record
 * across sandbox and production. The subscriptions and purchases lists do
 * carry an environment. So, per active entitlement:
 *
 *   grant        — every access-giving source for it is in the enforced
 *                  environment (at least one exists). Expiry comes from
 *                  RevenueCat's own active-entitlement answer.
 *   unverifiable — no source in the enforced environment, or sources in both.
 *                  The mirror row is left as it is: never granted, never
 *                  revoked, from state this deployment cannot attribute.
 *
 * An entitlement absent from `active_entitlements` is revoked by the database
 * if the mirror still holds it: RevenueCat positively says there is no access
 * in any environment.
 */

export interface SnapshotInput {
  environment: RevenueCatEnvironment;
  catalog: readonly CatalogEntitlement[];
  active: readonly ActiveEntitlement[];
  subscriptions: readonly CustomerSubscription[];
  purchases: readonly CustomerPurchase[];
  nowMs: number;
}

export interface SnapshotGrant {
  entitlement: string;
  expires_at: string | null;
}

export interface MirrorSnapshot {
  active: SnapshotGrant[];
  unverifiable: string[];
  /** Counts only; the ledger never stores provider identifiers from here. */
  summary: {
    environment: RevenueCatEnvironment;
    granted: string[];
    unverifiable: string[];
    subscriptions: number;
    purchases: number;
  };
}

export class SnapshotError extends Error {
  constructor(readonly code: 'SNAPSHOT_UNKNOWN_ENTITLEMENT' | 'SNAPSHOT_DUPLICATE_LOOKUP_KEY') {
    super(code);
    this.name = 'SnapshotError';
  }
}

export function buildMirrorSnapshot(input: SnapshotInput): MirrorSnapshot {
  const lookup = new Map<string, string>();
  const keys = new Set<string>();
  for (const entry of input.catalog) {
    if (keys.has(entry.lookup_key)) throw new SnapshotError('SNAPSHOT_DUPLICATE_LOOKUP_KEY');
    keys.add(entry.lookup_key);
    lookup.set(entry.id, entry.lookup_key);
  }

  const enforced = input.environment === 'PRODUCTION' ? 'production' : 'sandbox';
  const granting = [
    ...input.subscriptions
      .filter((subscription) => subscription.gives_access)
      .map((subscription) => ({
        environment: subscription.environment,
        entitlements: subscription.entitlements,
      })),
    ...input.purchases
      .filter((purchase) => purchase.status === 'owned')
      .map((purchase) => ({
        environment: purchase.environment,
        entitlements: purchase.entitlements,
      })),
  ];

  const byKey = new Map<string, number | null>();
  for (const entry of input.active) {
    if (entry.expires_at !== null && entry.expires_at <= input.nowMs) continue;
    const key = lookup.get(entry.entitlement_id);
    // An active entitlement the catalog does not name cannot be mapped to a
    // mirror row. Fail closed rather than let its row be revoked.
    if (key === undefined) throw new SnapshotError('SNAPSHOT_UNKNOWN_ENTITLEMENT');
    const previous = byKey.get(key);
    byKey.set(
      key,
      previous === undefined ? entry.expires_at : laterExpiry(previous, entry.expires_at),
    );
  }

  const active: SnapshotGrant[] = [];
  const unverifiable: string[] = [];
  for (const [key, expiresAt] of [...byKey.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const ids = [...lookup.entries()]
      .filter(([, lookupKey]) => lookupKey === key)
      .map(([id]) => id);
    const sources = granting.filter((source) =>
      source.entitlements.items.some((item) => ids.includes(item.id)),
    );
    const inEnvironment = sources.some((source) => source.environment === enforced);
    const elsewhere = sources.some((source) => source.environment !== enforced);
    if (inEnvironment && !elsewhere) {
      active.push({
        entitlement: key,
        expires_at: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      });
    } else {
      unverifiable.push(key);
    }
  }

  return {
    active,
    unverifiable,
    summary: {
      environment: input.environment,
      granted: active.map((grant) => grant.entitlement),
      unverifiable,
      subscriptions: input.subscriptions.length,
      purchases: input.purchases.length,
    },
  };
}

function laterExpiry(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return Math.max(left, right);
}
