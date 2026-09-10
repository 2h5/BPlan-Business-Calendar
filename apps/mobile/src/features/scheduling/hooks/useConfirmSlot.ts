import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { confirmFindTimeSuggestion, type FindTimeConfirmation } from '../api/find-time.api';

export interface ConfirmSlotState {
  confirmation: FindTimeConfirmation | null;
  confirmingSuggestionId: string | null;
  errorMessage: string | null;
  confirm: (suggestionId: string) => void;
  reset: () => void;
}

/**
 * Books one proposed slot. The server re-checks availability inside its own
 * transaction, so a slot taken while the user was deciding fails loudly here
 * rather than silently double-booking.
 */
export function useConfirmSlot(): ConfirmSlotState {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (suggestionId: string) => confirmFindTimeSuggestion(suggestionId),
    onSuccess: () => {
      // The new event must appear on Today and in the calendar immediately.
      void queryClient.invalidateQueries({ queryKey: queryKeys.events.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    },
  });

  return {
    confirmation: mutation.data ?? null,
    confirmingSuggestionId: mutation.isPending ? (mutation.variables ?? null) : null,
    errorMessage: mutation.error ? messageForError(mutation.error) : null,
    confirm: mutation.mutate,
    reset: mutation.reset,
  };
}

function messageForError(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  if (code === 'AI_PROPOSAL_STALE') {
    return 'That time was taken while you were deciding. Search again for fresh times.';
  }
  if (code === 'NOT_FOUND') return 'That suggestion is no longer available.';
  return 'Could not book that time. Please try again.';
}
