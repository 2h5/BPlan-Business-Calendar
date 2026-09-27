import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { APP_NAME } from '../../../lib/brand';
import { useEventLoader, useMoveEvent } from '../../events/hooks/useEvents';
import { proposeEventEdit, type AiEventMoveOption } from '../api/event-edit.api';

export interface EventEditState {
  /** Moves the server computed, best match first; empty until it answers. */
  options: AiEventMoveOption[];
  clarificationQuestion: string | null;
  /** The move the user confirmed and that was saved. */
  moved: AiEventMoveOption | null;
  errorMessage: string | null;
  requiresUpgrade: boolean;
  isPending: boolean;
  /** Which option is being saved, so only its button spins. */
  confirmingEventId: string | null;
  submit: (text: string) => void;
  confirm: (option: AiEventMoveOption) => void;
  reset: () => void;
}

/**
 * Drives "change an event" in the AI bar: the server proposes a move, the user
 * confirms one, and the save goes through `useMoveEvent` — the same path as a
 * drag on the calendar, so a Google or Outlook event is written to its
 * provider first and the calendar updates at once.
 */
export function useEventEdit(): EventEditState {
  const loadEvent = useEventLoader();
  const moveEvent = useMoveEvent();

  const proposal = useMutation({ mutationFn: (text: string) => proposeEventEdit(text) });
  const confirmation = useMutation({
    mutationFn: async (option: AiEventMoveOption) => {
      const event = await loadEvent(option.eventId);
      await moveEvent.mutateAsync({
        event,
        startAt: option.after.startAt,
        endAt: option.after.endAt,
      });
      return option;
    },
  });

  const { mutate: propose, reset: resetProposal } = proposal;
  const { mutate: save, reset: resetConfirmation } = confirmation;

  const submit = useCallback(
    (text: string) => {
      if (text.trim().length === 0) return;
      resetConfirmation();
      propose(text);
    },
    [propose, resetConfirmation],
  );

  const confirm = useCallback((option: AiEventMoveOption) => save(option), [save]);

  const reset = useCallback(() => {
    resetProposal();
    resetConfirmation();
  }, [resetProposal, resetConfirmation]);

  const data = proposal.data;
  const error = proposal.error ?? confirmation.error;

  return {
    options: data?.status === 'proposed' && !confirmation.data ? data.options : [],
    clarificationQuestion:
      data?.status === 'clarification_required' ? data.clarificationQuestion : null,
    moved: confirmation.data ?? null,
    errorMessage: error ? messageForError(error, confirmation.error !== null) : null,
    requiresUpgrade: codeOf(proposal.error) === 'SUBSCRIPTION_REQUIRED',
    isPending: proposal.isPending,
    confirmingEventId: confirmation.isPending ? (confirmation.variables?.eventId ?? null) : null,
    submit,
    confirm,
    reset,
  };
}

function messageForError(error: unknown, whileSaving: boolean): string {
  if (whileSaving) return 'Could not move that event. Check your connection and try again.';

  switch (codeOf(error)) {
    case 'AI_EVENT_NOT_FOUND':
      return 'No event matches that. Try its name as it appears on your calendar — or, to find time for something new, describe it without “change” or “move”.';
    case 'SUBSCRIPTION_REQUIRED':
      return `Changing events with AI is a Pro feature. Upgrade to let ${APP_NAME} do it for you.`;
    case 'AI_RATE_LIMITED':
      return "You've used all 10 AI requests this hour. Try again shortly.";
    case 'AI_PROVIDER_UNAVAILABLE':
      return 'AI is temporarily unavailable. Please try again shortly.';
    case 'AI_INVALID_OUTPUT':
      return 'Could not read that. Try something like “Move the dentist to Thursday at 3pm”.';
    case 'NOT_AUTHENTICATED':
      return 'Your session has expired. Please sign out and sign in again.';
    default:
      return 'Could not change that event right now. Please try again.';
  }
}

function codeOf(error: unknown): string | null {
  if (!error) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
