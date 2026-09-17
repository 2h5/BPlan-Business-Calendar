/**
 * The plans, and what a subscription row means.
 *
 * Shared by the web subscription page and the mobile upgrade prompt: the rule
 * for "does this account have Pro" has to be one rule, or the two clients will
 * eventually disagree about who is being charged for what.
 */
import type { Subscription, SubscriptionStatus } from '@cal/schemas/subscription';

export interface PlanFeature {
  id: string;
  name: string;
  description: string;
  isHero?: boolean;
  tag?: string;
}

export interface PlanTier {
  id: 'free' | 'pro';
  name: string;
  badge?: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  priceNote?: string;
  features: PlanFeature[];
  futureFeatures?: string[];
}

export const FREE_PLAN: PlanTier = {
  id: 'free',
  name: 'Free',
  tagline: 'Essential calendar & task planning for everyday scheduling',
  monthlyPrice: 0,
  annualPrice: 0,
  priceNote: 'Free forever',
  features: [
    {
      id: 'calendar-views',
      name: 'All Calendar Views',
      description: 'Day, week, and month views with drag-and-drop planning.',
    },
    {
      id: 'conflict-engine',
      name: 'Deterministic Conflict Detection',
      description: 'Instant zero-overlap schedule calculation with local timezone precision.',
    },
    {
      id: 'task-management',
      name: 'Task Lists & Prioritization',
      description: 'Organize tasks into lists with due dates, tags, and urgency tracking.',
    },
    {
      id: 'provider-sync',
      name: 'Google & Apple Calendar Sync',
      description: 'Bi-directional mirror synchronization with external calendars.',
    },
  ],
};

export const PRO_PLAN: PlanTier = {
  id: 'pro',
  name: 'Pro',
  badge: 'Most Popular',
  tagline: 'Supercharge your schedule with intelligent AI-assisted time finding',
  monthlyPrice: 4.99,
  annualPrice: 49.99,
  priceNote: 'Billed monthly or annually',
  features: [
    {
      id: 'find-time-ai',
      name: 'Find Time with AI',
      description:
        'Describe meetings in plain text (e.g. “30-min sync with team tomorrow afternoon”). Deterministic conflict checks guarantee valid openings, while AI ranks and explains the three best slots.',
      isHero: true,
      tag: 'AI Feature',
    },
    {
      id: 'one-click-booking',
      name: 'Instant 1-Click Scheduling',
      description: 'Book suggested meeting slots directly to your calendar with zero manual entry.',
    },
    {
      id: 'all-free-features',
      name: 'Everything in Free',
      description: 'All core calendar views, tasks, bi-directional sync, and preference controls.',
    },
  ],
  futureFeatures: [
    'Smart meeting buffer & break preservation rules',
    'Multi-attendee preferred availability windows',
    'Natural-language task prioritization & auto-scheduling',
  ],
};

export interface SubscriptionStatusInfo {
  state: 'free' | 'active' | 'paused' | 'expired';
  label: string;
  description: string;
  badgeVariant: 'neutral' | 'success' | 'warning' | 'danger';
  formattedExpiry: string | null;
  rawStatus: SubscriptionStatus | null;
}

export function formatSubscriptionExpiry(
  expiresAt: string | null | undefined,
  locale?: string,
): string | null {
  if (!expiresAt) return null;
  const expiryDate = new Date(expiresAt);
  if (Number.isNaN(expiryDate.getTime())) return null;

  return new Intl.DateTimeFormat(locale || undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(expiryDate);
}

export function getSubscriptionStatusInfo(
  subscription: Subscription | null | undefined,
  locale?: string,
): SubscriptionStatusInfo {
  if (!subscription) {
    return {
      state: 'free',
      label: 'Free Plan',
      description:
        'You are currently using BPlan Free. Upgrade anytime to unlock Find Time with AI.',
      badgeVariant: 'neutral',
      formattedExpiry: null,
      rawStatus: null,
    };
  }

  const formattedExpiry = formatSubscriptionExpiry(subscription.expiresAt, locale);

  switch (subscription.status) {
    case 'active':
      return {
        state: 'active',
        label: 'Pro Active',
        description: formattedExpiry
          ? `Your Pro subscription is active. Current period renews or ends on ${formattedExpiry}.`
          : 'Your Pro subscription is active with full access to all AI features.',
        badgeVariant: 'success',
        formattedExpiry,
        rawStatus: subscription.status,
      };
    case 'paused':
      return {
        state: 'paused',
        label: 'Pro Paused',
        description: formattedExpiry
          ? `Your subscription is paused until ${formattedExpiry}. Resume anytime to continue finding time with AI.`
          : 'Your subscription is paused. Resume anytime to continue finding time with AI.',
        badgeVariant: 'warning',
        formattedExpiry,
        rawStatus: subscription.status,
      };
    case 'expired':
    default:
      return {
        state: 'expired',
        label: 'Pro Expired',
        description: formattedExpiry
          ? `Your Pro access ended on ${formattedExpiry}. Renew to restore Find Time with AI.`
          : 'Your Pro subscription has expired. Renew anytime to restore Find Time with AI.',
        badgeVariant: 'danger',
        formattedExpiry,
        rawStatus: subscription.status,
      };
  }
}

export interface BillingIntervalSavings {
  monthlyAnnualized: number;
  annualTotal: number;
  savingsDollars: number;
  savingsPercentage: number;
}

export function calculateBillingIntervalSavings(
  monthlyPrice: number,
  annualPrice: number,
): BillingIntervalSavings {
  const monthlyAnnualized = monthlyPrice * 12;
  const savingsDollars = Math.max(0, monthlyAnnualized - annualPrice);
  const savingsPercentage =
    monthlyAnnualized > 0 ? Math.round((savingsDollars / monthlyAnnualized) * 100) : 0;

  return {
    monthlyAnnualized: Number(monthlyAnnualized.toFixed(2)),
    annualTotal: Number(annualPrice.toFixed(2)),
    savingsDollars: Number(savingsDollars.toFixed(2)),
    savingsPercentage,
  };
}

/** One line of the plan comparison table. */
export interface PlanComparisonRow {
  id: string;
  capability: string;
  /** Whether the Free tier includes it — a tick, or a dash when it does not. */
  inFree: boolean;
  /** Null means a plain tick; a string qualifies what Pro gets. */
  proLabel: string | null;
}

/**
 * The capability-by-capability comparison, shown on the web subscription page
 * and in the mobile upgrade prompt. Kept here so the two cannot drift into
 * advertising different things.
 */
export const PLAN_COMPARISON: readonly PlanComparisonRow[] = [
  {
    id: 'calendar-views',
    capability: 'Day, Week, & Month calendar views',
    inFree: true,
    proLabel: null,
  },
  {
    id: 'conflict-engine',
    capability: 'Deterministic conflict detection engine',
    inFree: true,
    proLabel: null,
  },
  {
    id: 'task-management',
    capability: 'Task management, priority, & tags',
    inFree: true,
    proLabel: null,
  },
  {
    id: 'provider-sync',
    capability: 'Google & Apple calendar 2-way sync',
    inFree: true,
    proLabel: null,
  },
  {
    id: 'find-time-ai',
    capability: 'Find Time with AI (natural language scheduling)',
    inFree: false,
    proLabel: 'Included',
  },
  {
    id: 'ai-ranking',
    capability: 'AI candidate ranking & explanations',
    inFree: false,
    proLabel: 'Included',
  },
  {
    id: 'one-click-booking',
    capability: '1-click suggested slot booking',
    inFree: false,
    proLabel: 'Included',
  },
  {
    id: 'upcoming-buffers',
    capability: 'Upcoming intelligent buffer & auto-rules',
    inFree: false,
    proLabel: 'Early Access',
  },
];
