import type { SchedulingIntent } from '@cal/schemas/scheduling';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

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
 * Drives the natural-language Find Time box: sends the raw text to Luna for
 * server-side intent interpretation, then renders the ranked slots the
 * deterministic engine verified.
 *
 * This is the phone's version of the web hook and shares its api, so the two
 * surfaces cannot drift on which windows a phrase resolves to.
 */
export function useFindTime(): FindTimeState {
  const mutation = useMutation({
    mutationFn: ({ text, timeZone }: { text: string; timeZone: string }) =>
      findTimeForText(text, timeZone),
  });

  const { mutate, reset: resetMutation, data } = mutation;

  const submit = useCallback(
    (text: string, timeZone: string) => {
      if (text.trim().length === 0) return;
      mutate({ text, timeZone });
    },
    [mutate],
  );

  const reset = useCallback(() => {
    resetMutation();
  }, [resetMutation]);

  // A clarification is a successful response with a question in it, not a failure.
  const clarification = data?.status === 'clarification_required' ? data : null;
  const proposal = data?.status === 'proposed' ? data : null;

  return {
    intent: ((proposal?.intent ?? clarification?.intent) as SchedulingIntent | undefined) ?? null,
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
      return 'AI scheduling is temporarily unavailable. Please try again shortly.';
    case 'SUBSCRIPTION_REQUIRED':
      return 'Find Time is a Pro feature. Upgrade to let BCal find open slots for you.';
    case 'AI_NO_VALID_SLOT':
      return 'No open time fits that in the window you asked for. Try a shorter block or a wider window.';
    case 'AI_RATE_LIMITED':
      return "You've used all 10 Find Time attempts this hour. Try again shortly.";
    case 'AI_DEFAULT_CALENDAR_MISSING':
      return 'Restore a writable default BCal calendar before finding time.';
    case 'AI_WINDOW_TOO_FAR':
      return 'That date is too far ahead to schedule yet. Try a date within the next year.';
    case 'AI_SCHEDULING_WINDOW_INVALID':
      return 'Check the timezone and working hours in your planning preferences.';
    case 'AI_INVALID_OUTPUT':
      return 'Could not read that request. Try describing it like “15 minutes with Patrick next week”.';
    case 'VALIDATION_FAILED':
      return 'Try describing it like “15 minutes with Patrick next week”.';
    default:
      return 'Could not find a time right now. Please try again.';
  }
}

function codeOf(error: unknown): string | null {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
