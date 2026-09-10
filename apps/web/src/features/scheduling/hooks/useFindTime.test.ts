import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetFindTimeStoreForTesting,
  FIND_TIME_DRAFT_KEY,
  FIND_TIME_SESSION_KEY,
  getFindTimeSnapshot,
  getStoredFindTimeDraft,
  resetFindTime,
  saveStoredFindTimeDraft,
  subscribeFindTime,
  submitFindTime,
} from './useFindTime';
import * as api from '../api/find-time.api';

vi.mock('../api/find-time.api', () => ({
  findTimeForText: vi.fn(),
}));

const storageMap = new Map<string, string>();
const mockSessionStorage = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, val: string) => storageMap.set(key, String(val))),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
};

Object.defineProperty(globalThis, 'window', {
  value: { sessionStorage: mockSessionStorage },
  configurable: true,
  writable: true,
});

describe('useFindTime background execution and persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMap.clear();
    _resetFindTimeStoreForTesting();
  });

  it('preserves draft text via storage helpers', () => {
    saveStoredFindTimeDraft('Meeting with Alex');
    expect(getStoredFindTimeDraft()).toBe('Meeting with Alex');
    expect(window.sessionStorage.getItem(FIND_TIME_DRAFT_KEY)).toBe('Meeting with Alex');

    saveStoredFindTimeDraft('');
    expect(getStoredFindTimeDraft()).toBe('');
    expect(window.sessionStorage.getItem(FIND_TIME_DRAFT_KEY)).toBeNull();
  });

  it('keeps running in the background across navigation and preserves results', async () => {
    let resolvePromise!: (val: api.FindTimeProposal) => void;
    const pendingPromise = new Promise<api.FindTimeProposal>((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(api.findTimeForText).mockReturnValue(pendingPromise);

    const states: ReturnType<typeof getFindTimeSnapshot>[] = [];
    const unsubscribe = subscribeFindTime(() => {
      states.push(getFindTimeSnapshot());
    });

    // Start search on Today
    submitFindTime('15 min sync with Andrew', 'America/New_York');

    const stateWhilePending = getFindTimeSnapshot();
    expect(stateWhilePending.isPending).toBe(true);
    expect(stateWhilePending.promptText).toBe('15 min sync with Andrew');

    // Simulate navigating to Calendar: unsubscribe Today component
    unsubscribe();

    // In-flight request finishes in the background while user is on Calendar
    const mockProposal: api.FindTimeProposal = {
      status: 'proposed',
      requestId: 'req-1',
      task: {
        id: null,
        title: '15 min sync with Andrew',
        durationMinutes: 15,
        deadlineAt: null,
      },
      targetCalendar: { id: 'cal-1', name: 'Primary' },
      suggestions: [
        {
          id: 'sugg-1',
          slotId: 'slot-1',
          startAt: '2026-09-12T14:00:00Z',
          endAt: '2026-09-12T14:15:00Z',
          rank: 1,
          score: 0.95,
          reason: 'Open afternoon slot',
        },
      ],
    };

    resolvePromise(mockProposal);
    await pendingPromise;

    // Simulate user returning to Today: read snapshot
    const stateAfterReturn = getFindTimeSnapshot();

    expect(stateAfterReturn.isPending).toBe(false);
    expect(stateAfterReturn.proposal).toEqual(mockProposal);
    expect(stateAfterReturn.promptText).toBe('15 min sync with Andrew');
    expect(api.findTimeForText).toHaveBeenCalledTimes(1);

    // Verify persisted in sessionStorage
    const stored = window.sessionStorage.getItem(FIND_TIME_SESSION_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).proposal.requestId).toBe('req-1');
  });

  it('resets query, proposal, and session storage on reset()', async () => {
    const mockProposal: api.FindTimeProposal = {
      status: 'proposed',
      requestId: 'req-2',
      task: {
        id: null,
        title: 'Call',
        durationMinutes: 30,
        deadlineAt: null,
      },
      targetCalendar: { id: 'cal-1', name: 'Primary' },
      suggestions: [],
    };

    vi.mocked(api.findTimeForText).mockResolvedValue(mockProposal);

    submitFindTime('Call', 'UTC');
    // Wait for microtask tick
    await Promise.resolve();
    await Promise.resolve();

    expect(getFindTimeSnapshot().proposal).toEqual(mockProposal);

    resetFindTime();

    expect(getFindTimeSnapshot().proposal).toBeNull();
    expect(getFindTimeSnapshot().promptText).toBe('');
    expect(window.sessionStorage.getItem(FIND_TIME_SESSION_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(FIND_TIME_DRAFT_KEY)).toBeNull();
  });
});
