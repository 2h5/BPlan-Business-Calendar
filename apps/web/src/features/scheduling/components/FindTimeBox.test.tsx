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
    expect(html).toContain('Find Time with Luna');
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

    expect(html).toContain('Find Time with Luna');
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
    expect(html).not.toContain('Find Time with Luna');

    // Must show interactive form input
    expect(html).toContain('placeholder="Try “15-minute meeting with Andrew”"');
    expect(html).toContain('aria-label="Describe what you want to schedule"');
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
});
