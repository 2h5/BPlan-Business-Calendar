import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

/** Applied when the user named no duration, e.g. "coffee with Priya". */
export const DEFAULT_MEETING_MINUTES = 30;

/** The server ranks more, but the box only ever offers a top three. */
export const MAX_SUGGESTIONS_SHOWN = 3;

const suggestionSchema = z.object({
  id: z.string().min(1),
  slotId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  rank: z.number().int().min(1),
  score: z.number(),
  reason: z.string().min(1),
});

/**
 * The server's own account of what it understood. Mobile renders this rather
 * than re-deriving labels on the client: the phone must never disagree with
 * the window the server actually searched.
 */
export const readbackSchema = z.object({
  title: z.string(),
  durationMinutes: z.number().int().nullable(),
  durationLabel: z.string(),
  dateLabel: z.string().nullable(),
  timeLabel: z.string().nullable(),
  location: z.string().nullable(),
});

export type FindTimeReadback = z.infer<typeof readbackSchema>;

/**
 * Luna asks rather than guesses when the text is genuinely ambiguous. This is
 * a normal outcome, not an error, so it must not collapse into the error path.
 */
export const clarificationSchema = z.object({
  status: z.literal('clarification_required'),
  requestId: z.string().min(1),
  clarificationQuestion: z.string().min(1),
  intent: z.unknown().optional(),
});

export type FindTimeClarification = z.infer<typeof clarificationSchema>;

const proposalSchema = z.object({
  status: z.literal('proposed'),
  requestId: z.string().min(1),
  task: z.object({
    id: z.string().nullable(),
    title: z.string(),
    durationMinutes: z.number().int(),
    deadlineAt: z.string().nullable(),
  }),
  targetCalendar: z.object({ id: z.string(), name: z.string() }),
  suggestions: z.array(suggestionSchema).min(1),
  readback: readbackSchema.optional(),
  intent: z.unknown().optional(),
});

export type FindTimeSuggestion = z.infer<typeof suggestionSchema>;
export type FindTimeProposal = z.infer<typeof proposalSchema>;
export type FindTimeResult = FindTimeProposal | FindTimeClarification;

const confirmationSchema = z.object({
  status: z.literal('accepted'),
  suggestionId: z.string().min(1),
  event: z.object({
    id: z.string().min(1),
    title: z.string(),
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    location: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  }),
});

export type FindTimeConfirmation = z.infer<typeof confirmationSchema>;

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/**
 * Submits the raw text to the server, which interprets it with Luna, resolves
 * the date window deterministically, verifies real availability, and ranks the
 * candidates.
 *
 * The window is deliberately NOT computed here. A phone that guessed its own
 * window could only express the handful of phrases it knew how to parse, which
 * is what previously collapsed "next week" onto the default horizon.
 */
export async function findTimeForText(text: string, _timeZone?: string): Promise<FindTimeResult> {
  const response = await invoke('ai-find-time', { text });

  const clarification = clarificationSchema.safeParse(response);
  if (clarification.success) return clarification.data;

  const parsed = proposalSchema.parse(response);
  return {
    ...parsed,
    suggestions: [...parsed.suggestions]
      .sort((left, right) => left.rank - right.rank)
      .slice(0, MAX_SUGGESTIONS_SHOWN),
  };
}

/**
 * Books one persisted suggestion. The server revalidates the exact slot
 * against current state before it creates anything, so a slot that filled up
 * while the user was deciding is rejected rather than double-booked.
 */
export async function confirmFindTimeSuggestion(
  suggestionId: string,
): Promise<FindTimeConfirmation> {
  return confirmationSchema.parse(await invoke('ai-confirm-time', { suggestionId }));
}

/**
 * Preserve the stable Edge Function error codes (AI_NO_VALID_SLOT,
 * SUBSCRIPTION_REQUIRED, ...) the box needs to explain what happened.
 */
async function invoke(name: string, body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke<unknown>(name, { body });

  if (error) {
    const envelope = await readErrorEnvelope(error);
    throw toAppError(envelope ?? error);
  }

  const failure = errorEnvelopeSchema.safeParse(data);
  if (failure.success) throw toAppError(failure.data.error);

  return data;
}

async function readErrorEnvelope(
  error: unknown,
): Promise<{ code: string; message: string } | null> {
  const response = (error as { context?: Response }).context;
  if (!response || typeof response.json !== 'function') return null;
  try {
    const parsed = errorEnvelopeSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.error : null;
  } catch {
    return null;
  }
}
