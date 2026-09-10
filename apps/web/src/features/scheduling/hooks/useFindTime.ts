import { parseSchedulingIntent, type SchedulingIntent } from '@cal/domain';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { findTimeForIntent, type FindTimeProposal } from '../api/find-time.api';

export interface FindTimeState {
  intent: SchedulingIntent | null;
  proposal: FindTimeProposal | null;
  errorMessage: string | null;
  isPending: boolean;
  submit: (text: string, timeZone: string) => void;
  reset: () => void;
}

/**
 * Drives the free-text Find Time box: parse the text deterministically, then
 * ask the server to rank the open slots the engine found.
 */
export function useFindTime(): FindTimeState {
  const [intent, setIntent] = useState<SchedulingIntent | null>(null);

  const mutation = useMutation({
    mutationFn: ({ text, timeZone }: { text: string; timeZone: string }) => {
      const parsed = parseSchedulingIntent(text);
      setIntent(parsed);
      return findTimeForIntent(parsed, timeZone);
    },
  });

  const { mutate, reset: resetMutation } = mutation;

  const submit = useCallback(
    (text: string, timeZone: string) => {
      if (text.trim().length === 0) return;
      mutate({ text, timeZone });
    },
    [mutate],
  );

  const reset = useCallback(() => {
    setIntent(null);
    resetMutation();
  }, [resetMutation]);

  return {
    intent,
    proposal: mutation.data ?? null,
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
