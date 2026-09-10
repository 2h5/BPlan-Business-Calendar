import type { SchedulingIntent } from '@cal/schemas/scheduling';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { queryClient, queryKeys } from '../../../lib/query/query-client';
import {
  findTimeForText,
  type FindTimeClarification,
  type FindTimeProposal,
  type FindTimeReadback,
} from '../api/find-time.api';

export const FIND_TIME_SESSION_KEY = 'bplan_find_time_session';
export const FIND_TIME_DRAFT_KEY = 'bplan_find_time_draft';

export interface StoredFindTime {
  promptText: string;
  proposal: FindTimeProposal | null;
  clarification: FindTimeClarification | null;
  errorMessage: string | null;
  isPending: boolean;
}

export interface FindTimeState {
  promptText?: string;
  intent: SchedulingIntent | null;
  readback: FindTimeReadback | null;
  proposal: FindTimeProposal | null;
  clarification: FindTimeClarification | null;
  errorMessage: string | null;
  isPending: boolean;
  submit: (text: string, timeZone: string) => void;
  reset: () => void;
}

let currentRequestId = 0;
let inFlightPromise: Promise<void> | null = null;
let storeState: StoredFindTime | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore
    }
  });
}

export function getStoredFindTimeDraft(): string {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return '';
    return window.sessionStorage.getItem(FIND_TIME_DRAFT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveStoredFindTimeDraft(text: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (text.trim().length === 0) {
        window.sessionStorage.removeItem(FIND_TIME_DRAFT_KEY);
      } else {
        window.sessionStorage.setItem(FIND_TIME_DRAFT_KEY, text);
      }
    }
  } catch {
    // Ignore storage quota
  }
}

export function clearStoredFindTimeDraft(): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(FIND_TIME_DRAFT_KEY);
    }
  } catch {
    // Ignore
  }
}

function getStoredSession(): StoredFindTime | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = window.sessionStorage.getItem(FIND_TIME_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredFindTime;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      promptText: typeof parsed.promptText === 'string' ? parsed.promptText : '',
      proposal: parsed.proposal ?? null,
      clarification: parsed.clarification ?? null,
      errorMessage: typeof parsed.errorMessage === 'string' ? parsed.errorMessage : null,
      isPending: inFlightPromise !== null,
    };
  } catch {
    return null;
  }
}

export function getFindTimeSnapshot(): StoredFindTime {
  if (storeState) return storeState;

  const stored = getStoredSession();
  if (stored) {
    storeState = stored;
    return storeState;
  }

  const draft = getStoredFindTimeDraft();
  storeState = {
    promptText: draft,
    proposal: null,
    clarification: null,
    errorMessage: null,
    isPending: inFlightPromise !== null,
  };
  return storeState;
}

function updateState(next: StoredFindTime): void {
  storeState = next;

  try {
    queryClient.setQueryData(queryKeys.scheduling.findTime(), next);
  } catch {
    // queryClient might not be initialized in isolated test environments
  }

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (!next.proposal && !next.clarification && !next.errorMessage && !next.isPending) {
        window.sessionStorage.removeItem(FIND_TIME_SESSION_KEY);
      } else {
        window.sessionStorage.setItem(FIND_TIME_SESSION_KEY, JSON.stringify(next));
      }
    }
  } catch {
    // Ignore storage quota
  }

  notifyListeners();
}

export function subscribeFindTime(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function submitFindTime(text: string, timeZone: string): void {
  if (text.trim().length === 0) return;
  saveStoredFindTimeDraft(text);

  currentRequestId += 1;
  const reqId = currentRequestId;

  const pendingState: StoredFindTime = {
    promptText: text,
    proposal: null,
    clarification: null,
    errorMessage: null,
    isPending: true,
  };
  updateState(pendingState);

  const promise = (async () => {
    try {
      const result = await findTimeForText(text, timeZone);
      if (currentRequestId !== reqId) return;

      if (result.status === 'clarification_required') {
        updateState({
          promptText: text,
          proposal: null,
          clarification: result,
          errorMessage: null,
          isPending: false,
        });
      } else {
        updateState({
          promptText: text,
          proposal: result,
          clarification: null,
          errorMessage: null,
          isPending: false,
        });
      }
    } catch (error) {
      if (currentRequestId !== reqId) return;
      updateState({
        promptText: text,
        proposal: null,
        clarification: null,
        errorMessage: messageForError(error),
        isPending: false,
      });
    } finally {
      if (currentRequestId === reqId) {
        inFlightPromise = null;
      }
    }
  })();

  inFlightPromise = promise;
}

export function resetFindTime(): void {
  currentRequestId += 1;
  inFlightPromise = null;
  clearStoredFindTimeDraft();
  updateState({
    promptText: '',
    proposal: null,
    clarification: null,
    errorMessage: null,
    isPending: false,
  });
}

export function _resetFindTimeStoreForTesting(): void {
  currentRequestId += 1;
  inFlightPromise = null;
  storeState = null;
  clearStoredFindTimeDraft();
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(FIND_TIME_SESSION_KEY);
    }
  } catch {
    // Ignore
  }
}

/**
 * Drives the natural-language Find Time box: sends the raw text to Luna
 * for server-side intent interpretation, conflict-free availability verification,
 * and candidate ranking.
 *
 * Persists in the background across navigation and tab switches so navigating
 * away from Today will never abort in-flight requests or discard expensive results.
 */
export function useFindTime(): FindTimeState {
  const data = useSyncExternalStore(subscribeFindTime, getFindTimeSnapshot, getFindTimeSnapshot);

  const submit = useCallback((text: string, timeZone: string) => {
    submitFindTime(text, timeZone);
  }, []);

  const reset = useCallback(() => {
    resetFindTime();
  }, []);

  const activeIntent =
    (data.proposal?.intent as SchedulingIntent | undefined) ??
    (data.clarification?.intent as SchedulingIntent | undefined) ??
    null;

  return useMemo(
    () => ({
      promptText: data.promptText,
      intent: activeIntent,
      readback: data.proposal?.readback ?? null,
      proposal: data.proposal,
      clarification: data.clarification,
      errorMessage: data.errorMessage,
      isPending: data.isPending,
      submit,
      reset,
    }),
    [
      data.promptText,
      activeIntent,
      data.proposal,
      data.clarification,
      data.errorMessage,
      data.isPending,
      submit,
      reset,
    ],
  );
}

/**
 * The Edge Function returns stable codes; each one has a different next step
 * for the user, so they must not collapse into one generic failure.
 */
function messageForError(error: unknown): string {
  switch (codeOf(error)) {
    case 'NOT_AUTHENTICATED':
      return 'Your session has expired. Please sign out and sign in again.';
    case 'AI_PROVIDER_UNAVAILABLE':
      return 'AI scheduling service is temporarily unavailable. Please try again shortly.';
    case 'SUBSCRIPTION_REQUIRED':
      return 'Find Time is a Pro feature. Upgrade to let BPlan find open slots for you.';
    case 'AI_NO_VALID_SLOT':
      return 'No open time fits that in the next week. Try a shorter block or a wider window.';
    case 'AI_RATE_LIMITED':
      return "You've used all 10 Find Time attempts this hour. Try again shortly.";
    case 'AI_DEFAULT_CALENDAR_MISSING':
      return 'Restore a writable default BPlan calendar before finding time.';
    case 'AI_WINDOW_TOO_FAR':
      return 'That date is too far ahead to schedule yet. Try a date within the next year.';
    case 'AI_SCHEDULING_WINDOW_INVALID':
      return 'Check the timezone and working hours in your planning preferences.';
    case 'AI_CLARIFICATION_REQUIRED':
      return 'Please clarify what time or duration you prefer.';
    case 'VALIDATION_FAILED':
      return 'Try describing it like “15-minute meeting with Andrew”.';
    default:
      return 'Could not find a time right now. Please try again.';
  }
}

function codeOf(error: unknown): string | null {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
