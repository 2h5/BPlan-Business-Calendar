import type { SchedulingIntent } from '@cal/schemas/scheduling';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import {
  findTimeForText,
  type FindTimeClarification,
  type FindTimeProposal,
  type FindTimeReadback,
} from '../api/find-time.api';

export interface FindTimeState {
  intent: SchedulingIntent | null;
  readback: FindTimeReadback | null;
  proposal: FindTimeProposal | null;
  clarification: FindTimeClarification | null;
  errorMessage: string | null;
  isPending: boolean;
  submit: (text: string, timeZone: string) => void;
  reset: () => void;
}

/**
 * Drives the natural-language Find Time box: sends the raw text to Luna
 * for server-side intent interpretation, conflict-free availability verification,
 * and candidate ranking.
 */
export function useFindTime(): FindTimeState {
  const [proposal, setProposal] = useState<FindTimeProposal | null>(null);
  const [clarification, setClarification] = useState<FindTimeClarification | null>(null);

  const mutation = useMutation({
    mutationFn: ({ text, timeZone }: { text: string; timeZone: string }) => {
      return findTimeForText(text, timeZone);
    },
    onSuccess: (result) => {
      if (result.status === 'clarification_required') {
        setClarification(result);
        setProposal(null);
      } else {
        setProposal(result);
        setClarification(null);
      }
    },
    onError: () => {
      setProposal(null);
      setClarification(null);
    },
  });

  const { mutate, reset: resetMutation } = mutation;

  const submit = useCallback(
    (text: string, timeZone: string) => {
      if (text.trim().length === 0) return;
      setClarification(null);
      setProposal(null);
      mutate({ text, timeZone });
    },
    [mutate],
  );

  const reset = useCallback(() => {
    setClarification(null);
    setProposal(null);
    resetMutation();
  }, [resetMutation]);

  const activeIntent =
    (proposal?.intent as SchedulingIntent | undefined) ??
    (clarification?.intent as SchedulingIntent | undefined) ??
    null;

  return {
    intent: activeIntent,
    readback: proposal?.readback ?? null,
    proposal,
    clarification,
    errorMessage: mutation.error ? messageForError(mutation.error) : null,
    isPending: mutation.isPending,
    submit,
    reset,
  };
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
