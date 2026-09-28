import type { CalendarEvent } from '@cal/schemas';
import type { AppError } from '@cal/types';

import type { AiEventMoveOption } from '../api/event-edit.api';

/**
 * Whether a proposed move still describes the event as it is now.
 *
 * A proposal is computed from the event's times when it was made. By the time
 * the user taps Move, another device, a provider sync, or the editor may have
 * moved, resized, cancelled, or made it recurring — and applying the old
 * `after` would silently undo that. Only a proposal whose `before` is still
 * exactly the event's current state may be applied.
 */
export function isMoveProposalCurrent(event: CalendarEvent, option: AiEventMoveOption): boolean {
  return (
    event.id === option.eventId &&
    event.status !== 'cancelled' &&
    event.recurrenceRule === null &&
    event.recurringEventId === null &&
    event.allDay === option.allDay &&
    sameInstant(event.startAt, option.before.startAt) &&
    sameInstant(event.endAt, option.before.endAt)
  );
}

/** Postgres and the Edge Function may spell one instant differently (`+00:00` vs `Z`). */
function sameInstant(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

export interface ApplyMoveProposalDeps {
  /** Reads the event as the server has it now; throws `NOT_FOUND` once it is gone. */
  loadEvent: (id: string) => Promise<CalendarEvent>;
  moveEvent: (payload: { event: CalendarEvent; startAt: string; endAt: string }) => Promise<void>;
}

/**
 * Applies a confirmed proposal only if the event is still as proposed; a
 * changed or deleted event fails with `AI_PROPOSAL_STALE` and nothing is written.
 */
export async function applyMoveProposal(
  option: AiEventMoveOption,
  deps: ApplyMoveProposalDeps,
): Promise<AiEventMoveOption> {
  let event: CalendarEvent;
  try {
    event = await deps.loadEvent(option.eventId);
  } catch (error) {
    throw (error as { code?: unknown } | null)?.code === 'NOT_FOUND' ? staleProposal() : error;
  }
  if (!isMoveProposalCurrent(event, option)) throw staleProposal();

  await deps.moveEvent({ event, startAt: option.after.startAt, endAt: option.after.endAt });
  return option;
}

function staleProposal(): AppError {
  return { code: 'AI_PROPOSAL_STALE', message: 'That event changed since this was suggested.' };
}
