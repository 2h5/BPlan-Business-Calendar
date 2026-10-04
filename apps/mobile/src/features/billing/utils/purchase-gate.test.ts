import { describe, expect, it } from 'vitest';

import {
  activePurchaseLock,
  nextPurchaseLock,
  PLAN_CHECK_FAILED,
  purchaseBlocker,
  type PlanCheck,
  type PurchaseBlockerInput,
  type PurchaseLock,
} from './purchase-gate';

const OPENED = 1_000;

const freshPlan: PlanCheck = {
  isLoading: false,
  isChecking: false,
  isUnavailable: false,
  lastCheckFailed: false,
  checkedAt: OPENED + 50,
};

function input(overrides: Partial<PurchaseBlockerInput> = {}): PurchaseBlockerInput {
  return {
    supported: true,
    plan: freshPlan,
    openedAt: OPENED,
    pricesPending: false,
    pricesFailed: false,
    hasSelectedPlan: true,
    ...overrides,
  };
}

describe('purchaseBlocker', () => {
  it('allows buying after a successful check since the page opened', () => {
    expect(purchaseBlocker(input())).toBeNull();
  });

  it('blocks when a re-read failed, even with an earlier "free" answer cached', () => {
    const plan = { ...freshPlan, lastCheckFailed: true, checkedAt: OPENED - 60_000 };
    expect(purchaseBlocker(input({ plan }))).toBe(PLAN_CHECK_FAILED);
  });

  it('blocks when the plan could never be read', () => {
    const plan = { ...freshPlan, isUnavailable: true, lastCheckFailed: true, checkedAt: 0 };
    expect(purchaseBlocker(input({ plan }))).toBe(PLAN_CHECK_FAILED);
  });

  it('blocks on an answer older than the page, until the re-read lands', () => {
    const plan = { ...freshPlan, checkedAt: OPENED - 1 };
    expect(purchaseBlocker(input({ plan }))).toBe('Checking your current plan…');
    expect(purchaseBlocker(input({ openedAt: null }))).toBe('Checking your current plan…');
  });

  it('blocks while a check is in flight', () => {
    const plan = { ...freshPlan, isChecking: true, lastCheckFailed: true };
    expect(purchaseBlocker(input({ plan }))).toBe('Checking your current plan…');
  });

  it('blocks on store problems after the plan check passes', () => {
    expect(purchaseBlocker(input({ supported: false }))).toMatch(/isn’t set up/);
    expect(purchaseBlocker(input({ pricesPending: true }))).toMatch(/Loading prices/);
    expect(purchaseBlocker(input({ pricesFailed: true }))).toMatch(/Couldn’t load prices/);
    expect(purchaseBlocker(input({ hasSelectedPlan: false }))).toMatch(/isn’t available/);
  });
});

describe('purchase lock', () => {
  const lock: PurchaseLock = { userId: 'a', of: 'restore', retryAt: 60_000, round: 0 };

  it('locks every flow after an unconfirmed restore', () => {
    const next = nextPurchaseLock(null, 'a', {
      kind: 'unconfirmed',
      of: 'restore',
      retryAt: 60_000,
      round: 0,
    });
    expect(next).toEqual(lock);
    // Another flow for the same account sees it.
    expect(activePurchaseLock(next, 'a')).toBe(next);
  });

  it('carries the round forward on a later unconfirmed re-check', () => {
    const next = nextPurchaseLock(lock, 'a', {
      kind: 'unconfirmed',
      of: 'restore',
      retryAt: 120_000,
      round: 1,
    });
    expect(next).toEqual({ userId: 'a', of: 'restore', retryAt: 120_000, round: 1 });
  });

  it('clears once the server confirms', () => {
    expect(nextPurchaseLock(lock, 'a', { kind: 'confirmed' })).toBeNull();
  });

  it('leaves another account’s lock alone on confirmation', () => {
    expect(nextPurchaseLock(lock, 'b', { kind: 'confirmed' })).toBe(lock);
  });

  it('does not apply to another account or a signed-out app', () => {
    expect(activePurchaseLock(lock, 'b')).toBeNull();
    expect(activePurchaseLock(lock, null)).toBeNull();
  });
});
