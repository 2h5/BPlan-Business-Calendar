// @vitest-environment jsdom
import '../../../../test/dom';

import type { Subscription } from '@cal/schemas/subscription';
import type { UseQueryResult } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FindTimeBox } from './FindTimeBox';
import styles from './FindTimeBox.module.css';
import type {
  FindTimeConfirmation,
  FindTimeProposal,
  FindTimeSuggestion,
} from '../api/find-time.api';
import type { ConfirmSlotState } from '../hooks/useConfirmSlot';
import type { FindTimeState } from '../hooks/useFindTime';
import {
  BANNER_TOTAL_DURATION_MS,
  CONFIRMATION_DISPLAY_DURATION_MS,
  getStoredBanner,
} from '../utils/scheduled-notice-storage';

vi.mock('../../../../lib/supabase/client', () => ({ supabase: {} }));

vi.mock('../../../billing/hooks/useBilling', () => ({
  useSubscription: () =>
    ({
      data: { status: 'active', entitlement: 'pro', expiresAt: '2026-12-31T00:00:00Z' },
      isLoading: false,
      isError: false,
    }) as unknown as UseQueryResult<Subscription | null, Error>,
}));

// Small stateful stand-ins for the two server hooks. Tests settle a request by
// calling `findTime.settle` or `booking.settle`, the way the query would.
type FindTimeData = Pick<FindTimeState, 'proposal' | 'errorMessage' | 'isPending'>;
type BookingData = Pick<ConfirmSlotState, 'confirmation' | 'confirmingSuggestionId'>;

const findTime = {
  submit: vi.fn(),
  reset: vi.fn(),
  settle: (_next: Partial<FindTimeData>) => {},
};
const booking = {
  confirm: vi.fn(),
  reset: vi.fn(),
  settle: (_next: Partial<BookingData>) => {},
};

const idleFindTime: FindTimeData = { proposal: null, errorMessage: null, isPending: false };
const idleBooking: BookingData = { confirmation: null, confirmingSuggestionId: null };

function useFakeFindTime(): FindTimeState {
  const [data, setData] = useState(idleFindTime);
  findTime.settle = (next) => setData((current) => ({ ...current, ...next }));
  return useMemo(
    () => ({
      ...data,
      intent: null,
      readback: null,
      clarification: null,
      submit: (text: string, timeZone: string) => {
        findTime.submit(text, timeZone);
        setData({ ...idleFindTime, isPending: true });
      },
      reset: () => {
        findTime.reset();
        setData(idleFindTime);
      },
    }),
    [data],
  );
}

function useFakeConfirmSlot(): ConfirmSlotState {
  const [data, setData] = useState(idleBooking);
  booking.settle = (next) => setData((current) => ({ ...current, ...next }));
  return useMemo(
    () => ({
      ...data,
      errorMessage: null,
      confirm: (suggestionId: string) => {
        booking.confirm(suggestionId);
        setData({ ...idleBooking, confirmingSuggestionId: suggestionId });
      },
      reset: () => {
        booking.reset();
        setData(idleBooking);
      },
    }),
    [data],
  );
}

const draftStorage = vi.hoisted(() => ({
  get: vi.fn(() => ''),
  save: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('../hooks/useFindTime', () => ({
  useFindTime: () => useFakeFindTime(),
  getStoredFindTimeDraft: draftStorage.get,
  saveStoredFindTimeDraft: draftStorage.save,
  clearStoredFindTimeDraft: draftStorage.clear,
}));

vi.mock('../hooks/useConfirmSlot', () => ({
  useConfirmSlot: () => useFakeConfirmSlot(),
}));

const suggestions: FindTimeSuggestion[] = [
  {
    id: 'sugg-1',
    slotId: 'slot-1',
    startAt: '2026-09-28T15:00:00Z',
    endAt: '2026-09-28T15:30:00Z',
    rank: 1,
    score: 0.98,
    reason: 'Morning focus block.',
  },
  {
    id: 'sugg-2',
    slotId: 'slot-2',
    startAt: '2026-09-28T19:00:00Z',
    endAt: '2026-09-28T19:30:00Z',
    rank: 2,
    score: 0.9,
    reason: 'After lunch.',
  },
];

const proposal: FindTimeProposal = {
  status: 'proposed',
  requestId: 'req-1',
  task: { id: null, title: 'Sync with Sam', durationMinutes: 30, deadlineAt: null },
  targetCalendar: { id: 'cal-1', name: 'Primary' },
  suggestions,
};

const confirmation: FindTimeConfirmation = {
  status: 'accepted',
  suggestionId: 'sugg-1',
  event: {
    id: 'event-1',
    title: 'Sync with Sam',
    startAt: '2026-09-28T15:00:00Z',
    endAt: '2026-09-28T15:30:00Z',
  },
};

function renderBox(onScheduled = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <FindTimeBox timeZone="America/New_York" onScheduled={onScheduled} />
    </MemoryRouter>,
  );
  return { ...view, onScheduled };
}

// Timed tests: the phase durations are the contract, so they use fake timers
// with synchronous fireEvent (see docs/dom-component-testing.md).
function renderTimedBox() {
  vi.useFakeTimers();
  return renderBox();
}

function elapse(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

function input() {
  return screen.getByRole('textbox', { name: 'Describe what you want to schedule' });
}

function typeText(text: string) {
  fireEvent.change(input(), { target: { value: text } });
}

function slotButtons() {
  return screen.queryAllByRole('button', { name: /^Schedule$|Booking…/ });
}

function results() {
  return screen.queryByText('Verified Open Slots')?.closest(`.${styles.results}`) ?? null;
}

function confirmationCard() {
  return screen.queryByText('Successfully Scheduled');
}

function banner() {
  const dismiss = screen.queryByRole('button', { name: 'Dismiss scheduled notice' });
  return dismiss?.closest<HTMLElement>('[role="status"]') ?? null;
}

function showProposal() {
  typeText('Sync with Sam tomorrow');
  fireEvent.submit(input().closest('form') as HTMLFormElement);
  act(() => findTime.settle({ isPending: false, proposal }));
}

function bookFirstSlot() {
  fireEvent.click(slotButtons()[0] as HTMLElement);
  act(() => booking.settle({ confirmation, confirmingSuggestionId: null }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

describe('FindTimeBox search', () => {
  it('submits the typed request and shows the pending state', async () => {
    const user = userEvent.setup();
    renderBox();
    const submit = screen.getByRole('button', { name: 'Find time' });
    expect(submit).toBeDisabled();

    await user.type(input(), '   ');
    expect(submit).toBeDisabled();

    await user.clear(input());
    await user.type(input(), 'Sync with Sam tomorrow{Enter}');

    expect(findTime.submit).toHaveBeenCalledWith('Sync with Sam tomorrow', 'America/New_York');
    expect(draftStorage.save).toHaveBeenLastCalledWith('Sync with Sam tomorrow');
    expect(screen.getByRole('button', { name: 'Finding slots…' })).toBeDisabled();

    act(() => findTime.settle({ isPending: false, proposal }));
    expect(screen.getByText('Morning focus block.')).toBeInTheDocument();
    expect(input()).toHaveValue('Sync with Sam tomorrow');
  });

  it('clears a search error as soon as the request is edited', async () => {
    const user = userEvent.setup();
    renderBox();

    await user.type(input(), 'Sync{Enter}');
    act(() => findTime.settle({ isPending: false, errorMessage: 'Could not reach Luna.' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach Luna.');

    await user.type(input(), '!');

    expect(findTime.reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lets the results exit for 280 ms after Escape before resetting the search', () => {
    renderTimedBox();
    showProposal();

    fireEvent.keyDown(input(), { key: 'Escape' });

    expect(input()).toHaveValue('');
    expect(results()).toHaveClass(styles.proposalExiting ?? '__missing__');
    elapse(279);
    expect(findTime.reset).not.toHaveBeenCalled();

    elapse(1);
    expect(findTime.reset).toHaveBeenCalledTimes(1);
    expect(results()).toBeNull();
  });

  it('starts the same exit when the request is cleared, and cancels it when typing resumes', () => {
    renderTimedBox();
    showProposal();

    typeText('');
    expect(results()).toHaveClass(styles.proposalExiting ?? '__missing__');

    elapse(100);
    typeText('S');
    elapse(500);

    expect(findTime.reset).not.toHaveBeenCalled();
    expect(results()).not.toHaveClass(styles.proposalExiting ?? '__missing__');
    expect(screen.getByText('Morning focus block.')).toBeInTheDocument();
  });
});

describe('FindTimeBox booking and scheduled notices', () => {
  it('books a slot, reports it, and disables the other slots while booking', () => {
    const { onScheduled } = renderTimedBox();
    showProposal();

    fireEvent.click(slotButtons()[1] as HTMLElement);

    expect(booking.confirm).toHaveBeenCalledWith('sugg-2');
    expect(onScheduled).toHaveBeenCalledWith(suggestions[1]);
    expect(input()).toHaveValue('');
    expect(draftStorage.clear).toHaveBeenCalled();
    // Result cards are hidden once the search resets; booking continues.
    expect(results()).toBeNull();
  });

  it('shows the confirmation for 5 s, then the banner for 30 s, then exits over 350 ms', () => {
    renderTimedBox();
    showProposal();
    bookFirstSlot();

    expect(confirmationCard()).toBeInTheDocument();
    expect(banner()).toBeNull();
    expect(getStoredBanner()).toMatchObject({ phase: 'confirmation' });

    elapse(CONFIRMATION_DISPLAY_DURATION_MS - 1);
    expect(confirmationCard()).toBeInTheDocument();
    elapse(1);
    expect(confirmationCard()).toBeNull();
    expect(banner()).toHaveTextContent('Sync with Sam');
    expect(getStoredBanner()).toMatchObject({ phase: 'banner' });

    elapse(BANNER_TOTAL_DURATION_MS - 1);
    expect(banner()).not.toHaveClass(styles.recentBannerExiting ?? '__missing__');
    elapse(1);
    expect(banner()).toHaveClass(styles.recentBannerExiting ?? '__missing__');
    expect(getStoredBanner()).toBeNull();

    elapse(349);
    expect(banner()).toBeInTheDocument();
    elapse(1);
    expect(banner()).toBeNull();
  });

  it('docks the banner at once and focuses the request after Schedule another', () => {
    renderTimedBox();
    showProposal();
    bookFirstSlot();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule another' }));

    expect(confirmationCard()).toBeNull();
    expect(banner()).toBeInTheDocument();
    elapse(49);
    expect(input()).not.toHaveFocus();
    elapse(1);
    expect(input()).toHaveFocus();
  });

  it('dismisses the banner over 350 ms from its close button or a new search', () => {
    renderTimedBox();
    showProposal();
    bookFirstSlot();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule another' }));

    expect(getStoredBanner()).toMatchObject({ phase: 'banner' });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss scheduled notice' }));
    expect(banner()).toHaveClass(styles.recentBannerExiting ?? '__missing__');
    expect(getStoredBanner()).toBeNull();
    elapse(350);
    expect(banner()).toBeNull();

    showProposal();
    bookFirstSlot();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule another' }));
    showProposal();
    expect(banner()).toHaveClass(styles.recentBannerExiting ?? '__missing__');
    elapse(350);
    expect(banner()).toBeNull();
    expect(screen.getByText('Morning focus block.')).toBeInTheDocument();
  });

  it('resumes the stored phase after remounting, as after route navigation', () => {
    const first = renderTimedBox();
    showProposal();
    bookFirstSlot();
    elapse(2000);
    first.unmount();
    expect(vi.getTimerCount()).toBe(0);

    renderBox();
    expect(confirmationCard()).toBeInTheDocument();

    elapse(CONFIRMATION_DISPLAY_DURATION_MS - 2000);
    expect(confirmationCard()).toBeNull();
    expect(banner()).toBeInTheDocument();
  });
});
