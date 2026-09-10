import { describe, expect, it } from 'vitest';

import {
  calculateBillingIntervalSavings,
  formatSubscriptionExpiry,
  FREE_PLAN,
  getSubscriptionStatusInfo,
  PRO_PLAN,
} from './subscription-display';

describe('subscription-display', () => {
  describe('Plan metadata', () => {
    it('defines Free and Pro plan tiers with correct identifiers', () => {
      expect(FREE_PLAN.id).toBe('free');
      expect(PRO_PLAN.id).toBe('pro');
      expect(FREE_PLAN.monthlyPrice).toBe(0);
      expect(PRO_PLAN.monthlyPrice).toBe(4.99);
      expect(PRO_PLAN.annualPrice).toBe(49.99);
    });

    it('prominently marks Find Time with AI as the hero feature of Pro', () => {
      const heroFeature = PRO_PLAN.features.find((f) => f.id === 'find-time-ai');
      expect(heroFeature).toBeDefined();
      expect(heroFeature?.isHero).toBe(true);
      expect(heroFeature?.name).toContain('Find Time with AI');
      expect(heroFeature?.description).toContain('Deterministic conflict checks');
    });

    it('contains an extensible list of future Pro capabilities', () => {
      expect(PRO_PLAN.futureFeatures).toBeDefined();
      expect(PRO_PLAN.futureFeatures?.length).toBeGreaterThan(0);
    });
  });

  describe('formatSubscriptionExpiry', () => {
    it('returns null for null, undefined, or empty expiry strings', () => {
      expect(formatSubscriptionExpiry(null)).toBeNull();
      expect(formatSubscriptionExpiry(undefined)).toBeNull();
      expect(formatSubscriptionExpiry('')).toBeNull();
    });

    it('returns null for invalid date strings', () => {
      expect(formatSubscriptionExpiry('invalid-date')).toBeNull();
    });

    it('formats valid ISO date strings nicely', () => {
      const formatted = formatSubscriptionExpiry('2026-12-31T00:00:00.000Z', 'en-US');
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('2026');
    });
  });

  describe('getSubscriptionStatusInfo', () => {
    it('classifies null subscription as Free Plan', () => {
      const info = getSubscriptionStatusInfo(null);
      expect(info.state).toBe('free');
      expect(info.label).toBe('Free Plan');
      expect(info.badgeVariant).toBe('neutral');
      expect(info.formattedExpiry).toBeNull();
    });

    it('classifies active subscription correctly', () => {
      const info = getSubscriptionStatusInfo({
        entitlement: 'pro',
        status: 'active',
        expiresAt: '2026-10-15T12:00:00.000Z',
      });
      expect(info.state).toBe('active');
      expect(info.label).toBe('Pro Active');
      expect(info.badgeVariant).toBe('success');
      expect(info.formattedExpiry).toBeTruthy();
      expect(info.description).toContain('Your Pro subscription is active');
    });

    it('classifies paused subscription correctly', () => {
      const info = getSubscriptionStatusInfo({
        entitlement: 'pro',
        status: 'paused',
        expiresAt: '2026-10-15T12:00:00.000Z',
      });
      expect(info.state).toBe('paused');
      expect(info.label).toBe('Pro Paused');
      expect(info.badgeVariant).toBe('warning');
      expect(info.description).toContain('paused');
    });

    it('classifies expired subscription correctly', () => {
      const info = getSubscriptionStatusInfo({
        entitlement: 'pro',
        status: 'expired',
        expiresAt: '2026-08-01T12:00:00.000Z',
      });
      expect(info.state).toBe('expired');
      expect(info.label).toBe('Pro Expired');
      expect(info.badgeVariant).toBe('danger');
      expect(info.description).toContain('ended');
    });
  });

  describe('calculateBillingIntervalSavings', () => {
    it('calculates annual savings percentage against 12 monthly payments correctly', () => {
      const savings = calculateBillingIntervalSavings(4.99, 49.99);
      // 4.99 * 12 = 59.88. 59.88 - 49.99 = 9.89. 9.89 / 59.88 ≈ 16.5% -> 17% or 16%
      expect(savings.monthlyAnnualized).toBe(59.88);
      expect(savings.annualTotal).toBe(49.99);
      expect(savings.savingsDollars).toBe(9.89);
      expect(savings.savingsPercentage).toBeGreaterThanOrEqual(16);
    });

    it('handles zero or equal pricing gracefully', () => {
      const savings = calculateBillingIntervalSavings(0, 0);
      expect(savings.savingsDollars).toBe(0);
      expect(savings.savingsPercentage).toBe(0);
    });
  });
});
