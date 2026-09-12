import type { Subscription } from '@cal/schemas/subscription';
import type { UseQueryResult } from '@tanstack/react-query';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FindTimeBox } from './FindTimeBox';
import { useSubscription } from '../../billing/hooks/useBilling';
import { useConfirmSlot, type ConfirmSlotState } from '../hooks/useConfirmSlot';
import { useFindTime, type FindTimeState } from '../hooks/useFindTime';

vi.mock('../../../lib/supabase/client', () => ({
  supabase: {},
}));

vi.mock('../../billing/hooks/useBilling', () => ({
  useSubscription: vi.fn(),
}));

vi.mock('../hooks/useFindTime', () => ({
  useFindTime: vi.fn(),
  getStoredFindTimeDraft: vi.fn(() => ''),
  saveStoredFindTimeDraft: vi.fn(),
  clearStoredFindTimeDraft: vi.fn(),
}));

vi.mock('../hooks/useConfirmSlot', () => ({
  useConfirmSlot: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({
    to,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

function mockSubscriptionQuery(
  data: Subscription | null,
  options?: { isLoading?: boolean; isError?: boolean },
): UseQueryResult<Subscription | null, Error> {
  return {
    data,
    isLoading: options?.isLoading ?? false,
    isError: options?.isError ?? false,
  } as unknown as UseQueryResult<Subscription | null, Error>;
}

describe('FindTimeBox Pro Gating & Teaser', () => {
  const defaultFindTime: FindTimeState = {
    intent: null,
    readback: null,
    isPending: false,
    errorMessage: null,
    proposal: null,
    clarification: null,
    submit: vi.fn(),
    reset: vi.fn(),
  };

  const defaultConfirmSlot: ConfirmSlotState = {
    errorMessage: null,
    confirmation: null,
    confirmingSuggestionId: null,
    confirm: vi.fn(),
    reset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFindTime).mockReturnValue(defaultFindTime);
    vi.mocked(useConfirmSlot).mockReturnValue(defaultConfirmSlot);
  });

  it('renders locked teaser for Free users with disabled input and subscription link', () => {
    vi.mocked(useSubscription).mockReturnValue(mockSubscriptionQuery(null));

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    // Must show PRO badge and teaser heading
    expect(html).toContain('PRO');
    expect(html).toContain('Find Time with AI');
    expect(html).toContain('Upgrade to Pro');
    expect(html).toContain('href="/subscription"');

    // Must have disabled input with locked aria-label
    expect(html).toContain('disabled');
    expect(html).toContain('aria-label="Find Time with AI is available on the Pro plan"');

    // Must NOT expose active "Find time" submit button
    expect(html).not.toContain('Find time</span>');
  });

  it('renders locked teaser for expired or paused Pro users', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'expired',
        entitlement: 'pro',
        expiresAt: '2026-08-01T00:00:00Z',
      }),
    );

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    expect(html).toContain('Find Time with AI');
    expect(html).toContain('Upgrade to Pro');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Find time</span>');
  });

  it('renders interactive input and submit button for active Pro users', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'active',
        entitlement: 'pro',
        expiresAt: '2026-12-31T00:00:00Z',
      }),
    );

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    // Must NOT show locked teaser upgrade button
    expect(html).not.toContain('Upgrade to Pro');
    expect(html).not.toContain('Find Time with AI');

    // Must show interactive form input with custom rotating prompt
    expect(html).toContain('placeholder=""');
    expect(html).toContain('aria-label="Describe what you want to schedule"');
    expect(html).toContain('>Try</span>');
    expect(html).toContain('“15-minute meeting with Andrew”');
    expect(html).toContain('Find time</span>');
  });

  it('preserves post-booking confirmation card', () => {
    vi.mocked(useSubscription).mockReturnValue(mockSubscriptionQuery(null));

    vi.mocked(useConfirmSlot).mockReturnValue({
      ...defaultConfirmSlot,
      confirmation: {
        status: 'accepted',
        suggestionId: 'sugg-123',
        event: {
          id: 'event-123',
          title: 'Design Review with Luna',
          startAt: '2026-09-15T14:00:00Z',
          endAt: '2026-09-15T14:30:00Z',
        },
      },
    });

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    expect(html).toContain('Successfully Scheduled');
    expect(html).toContain('Design Review with Luna');
    expect(html).toContain('Schedule another');
    expect(html).toContain('View in Calendar');
  });

  it('restores the full confirmation card below the input during its five-second phase', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'active',
        entitlement: 'pro',
        expiresAt: '2026-12-31T00:00:00Z',
      }),
    );

    const storedConfirmation = {
      status: 'accepted',
      suggestionId: 'sugg-456',
      event: {
        id: 'event-456',
        title: 'Meet with Andrew',
        startAt: '2026-09-12T13:30:00Z',
        endAt: '2026-09-12T13:45:00Z',
      },
    };
    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          confirmation: storedConfirmation,
          phase: 'confirmation',
          expiresAt: Date.now() + 3000,
          bannerExpiresAt: Date.now() + 33000,
          totalDurationMs: 30000,
        }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: storage },
    });

    try {
      const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);
      const inputPosition = html.indexOf('aria-label="Describe what you want to schedule"');
      const confirmationPosition = html.indexOf('Successfully Scheduled');

      expect(inputPosition).toBeGreaterThanOrEqual(0);
      expect(confirmationPosition).toBeGreaterThan(inputPosition);
      expect(html).toContain('Meet with Andrew');
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('restores the compact banner when returning after the confirmation phase', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'active',
        entitlement: 'pro',
        expiresAt: '2026-12-31T00:00:00Z',
      }),
    );

    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          confirmation: {
            status: 'accepted',
            suggestionId: 'sugg-789',
            event: {
              id: 'event-789',
              title: 'Planning session',
              startAt: '2026-09-12T13:30:00Z',
              endAt: '2026-09-12T13:45:00Z',
            },
          },
          phase: 'confirmation',
          expiresAt: Date.now() - 1000,
          bannerExpiresAt: Date.now() + 29000,
          totalDurationMs: 30000,
        }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: storage },
    });

    try {
      const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

      expect(html).not.toContain('Successfully Scheduled');
      expect(html).toContain('>Scheduled</span>');
      expect(storage.setItem).toHaveBeenCalled();
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('renders verified open slots when a proposal is present for active Pro users', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'active',
        entitlement: 'pro',
        expiresAt: '2026-12-31T00:00:00Z',
      }),
    );

    vi.mocked(useFindTime).mockReturnValue({
      ...defaultFindTime,
      proposal: {
        status: 'proposed',
        requestId: 'req-slots',
        task: {
          id: null,
          title: 'Sync with Andrew',
          durationMinutes: 15,
          deadlineAt: null,
        },
        targetCalendar: { id: 'cal-1', name: 'Primary' },
        suggestions: [
          {
            id: 'sugg-1',
            slotId: 'slot-1',
            startAt: '2026-09-10T16:15:00Z',
            endAt: '2026-09-10T16:30:00Z',
            rank: 1,
            score: 0.98,
            reason: 'Evening timing with ample buffer.',
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    expect(html).toContain('Verified Open Slots');
    expect(html).toContain('Guaranteed Conflict-Free');
    expect(html).toContain('Evening timing with ample buffer.');
    expect(html).toContain('Schedule');
  });

  it('does NOT render verified slots while docked in the persistent banner state', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'active',
        entitlement: 'pro',
        expiresAt: '2026-12-31T00:00:00Z',
      }),
    );

    // Even if findTime hook has a stale proposal, docked banner state must not show old slots
    vi.mocked(useFindTime).mockReturnValue({
      ...defaultFindTime,
      proposal: null,
    });

    const storage = {
      getItem: vi.fn(() =>
        JSON.stringify({
          confirmation: {
            status: 'accepted',
            suggestionId: 'sugg-banner',
            event: {
              id: 'event-banner',
              title: 'Meeting with Andrew',
              startAt: '2026-09-10T16:15:00Z',
              endAt: '2026-09-10T16:30:00Z',
            },
          },
          phase: 'banner',
          expiresAt: Date.now() + 25000,
          totalDurationMs: 30000,
        }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { sessionStorage: storage },
    });

    try {
      const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

      // Must show the docked banner
      expect(html).toContain('>Scheduled</span>');
      expect(html).toContain('Meeting with Andrew');
      // Must NOT show the big green confirmation box
      expect(html).not.toContain('Successfully Scheduled');
      // Must NOT show the slots
      expect(html).not.toContain('Verified Open Slots');
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('renders clarification card with "BPlan needs more verification"', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'active',
        entitlement: 'pro',
        expiresAt: '2026-12-31T00:00:00Z',
      }),
    );

    vi.mocked(useFindTime).mockReturnValue({
      ...defaultFindTime,
      clarification: {
        status: 'clarification_required',
        requestId: 'req-clarify',
        clarificationQuestion: 'Did you mean Thursday morning or afternoon?',
      },
    });

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    expect(html).toContain('BPlan needs more verification');
    expect(html).not.toContain('Luna');
    expect(html).toContain('Did you mean Thursday morning or afternoon?');
  });

  it('hides the rotating prompt overlay when user has typed text or draft exists', () => {
    vi.mocked(useSubscription).mockReturnValue(
      mockSubscriptionQuery({
        status: 'active',
        entitlement: 'pro',
        expiresAt: '2026-12-31T00:00:00Z',
      }),
    );

    vi.mocked(useFindTime).mockReturnValue({
      ...defaultFindTime,
      promptText: '30-minute sync with Dave',
    });

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    // Must show the real user's input
    expect(html).toContain('value="30-minute sync with Dave"');
    // Must NOT render the rotating prompt overlay
    expect(html).not.toContain('promptOverlay');
    expect(html).not.toContain('>Try</span>');
    expect(html).not.toContain('“15-minute meeting with Andrew”');
  });

  it('renders locked teaser with static first example placeholder for Free users', () => {
    vi.mocked(useSubscription).mockReturnValue(mockSubscriptionQuery(null));

    const html = renderToStaticMarkup(<FindTimeBox timeZone="America/New_York" />);

    // Locked teaser must have static placeholder matching the first curated example
    expect(html).toContain('placeholder="Try “15-minute meeting with Andrew”"');
    expect(html).toContain('aria-label="Find Time with AI is available on the Pro plan"');
    // Locked teaser does not render animated overlay
    expect(html).not.toContain('promptOverlay');
  });
});
