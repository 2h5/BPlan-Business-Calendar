/**
 * The two rules that decide whether the upgrade page may sell, kept free of
 * React so they can be unit-tested.
 */

/** What the plan check looks like to the upgrade page. */
export interface PlanCheck {
  isLoading: boolean;
  isChecking: boolean;
  isUnavailable: boolean;
  /** The latest read failed, even if an older answer is still cached. */
  lastCheckFailed: boolean;
  /** When the cached answer was last read successfully (epoch ms; 0 = never). */
  checkedAt: number;
}

export interface PurchaseBlockerInput {
  supported: boolean;
  plan: PlanCheck;
  /** When the page opened (epoch ms), or null before it has. */
  openedAt: number | null;
  pricesPending: boolean;
  pricesFailed: boolean;
  hasSelectedPlan: boolean;
}

export const PLAN_CHECK_FAILED = 'Couldn’t check your current plan.';

/**
 * Why the buy button is off, or null when it may be pressed.
 *
 * Buying needs a plan check that succeeded since the page opened. An unknown
 * plan is not the free plan, and neither is a cached "free" whose re-read just
 * failed: someone who subscribed on the web since would be sold a second
 * subscription.
 */
export function purchaseBlocker(input: PurchaseBlockerInput): string | null {
  const { plan } = input;
  if (!input.supported) return 'In-app purchase isn’t set up in this build yet.';
  if (plan.isLoading || plan.isChecking) return 'Checking your current plan…';
  if (plan.isUnavailable || plan.lastCheckFailed) return PLAN_CHECK_FAILED;
  if (input.openedAt === null || plan.checkedAt < input.openedAt) {
    return 'Checking your current plan…';
  }
  if (input.pricesPending) return 'Loading prices from the App Store…';
  if (input.pricesFailed) return 'Couldn’t load prices from the App Store.';
  if (!input.hasSelectedPlan) return 'This plan isn’t available from the App Store right now.';
  return null;
}

export type StoreAction = 'purchase' | 'restore';

/**
 * The store took payment (or restore found one) and the server hasn't
 * confirmed Pro yet. Shared by every purchase flow in the app, so no screen
 * offers a second purchase while any of them is waiting.
 */
export interface PurchaseLock {
  userId: string;
  of: StoreAction;
  /** When the server will accept another refresh (epoch ms). */
  retryAt: number;
  /** Automatic re-checks already spent. */
  round: number;
}

/** What a confirmation round said, as far as the lock is concerned. */
export type ConfirmOutcome =
  { kind: 'confirmed' } | { kind: 'unconfirmed'; of: StoreAction; retryAt: number; round: number };

/** The lock after a confirmation round for `userId`. */
export function nextPurchaseLock(
  current: PurchaseLock | null,
  userId: string,
  outcome: ConfirmOutcome,
): PurchaseLock | null {
  if (outcome.kind === 'confirmed') {
    return current && current.userId !== userId ? current : null;
  }
  return { userId, of: outcome.of, retryAt: outcome.retryAt, round: outcome.round };
}

/** The lock as it applies to whoever is signed in now. */
export function activePurchaseLock(
  lock: PurchaseLock | null,
  userId: string | null,
): PurchaseLock | null {
  return lock && userId !== null && lock.userId === userId ? lock : null;
}
