/**
 * Re-exported from `@cal/domain`, where the plans and the entitlement rule now
 * live so the mobile app reads them the same way. Kept as a module here
 * because the billing feature, Find Time, and their tests import this path.
 */
export {
  calculateBillingIntervalSavings,
  formatSubscriptionExpiry,
  FREE_PLAN,
  getSubscriptionStatusInfo,
  PLAN_COMPARISON,
  PRO_PLAN,
  type BillingIntervalSavings,
  type PlanComparisonRow,
  type PlanFeature,
  type PlanTier,
  type SubscriptionStatusInfo,
} from '@cal/domain';
