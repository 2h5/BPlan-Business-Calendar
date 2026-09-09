import { addZonedDays, startOfZonedDay, type SchedulingIntent } from '@cal/domain';
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
});

export type FindTimeSuggestion = z.infer<typeof suggestionSchema>;
export type FindTimeProposal = z.infer<typeof proposalSchema>;

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/**
 * Asks the server for ranked open slots for an ad-hoc block. The client sends
 * the parsed duration; the server's deterministic engine — never the model —
 * decides which times are actually free.
 */
export async function findTimeForIntent(
  intent: SchedulingIntent,
  timeZone: string,
  now: Date = new Date(),
): Promise<FindTimeProposal> {
  const window = resolveWindow(intent.dayHint, timeZone, now);

  const proposal = await invoke('ai-find-time', {
    title: intent.title,
    durationMinutes: intent.durationMinutes ?? DEFAULT_MEETING_MINUTES,
    preferredTimeOfDay: intent.preferredTimeOfDay,
    ...window,
  });

  const parsed = proposalSchema.parse(proposal);
  return {
    ...parsed,
    suggestions: [...parsed.suggestions]
      .sort((left, right) => left.rank - right.rank)
      .slice(0, MAX_SUGGESTIONS_SHOWN),
  };
}

/**
 * A named day narrows the search window. Anything else is left to the server's
 * default horizon rather than guessed at here.
 */
function resolveWindow(
  dayHint: SchedulingIntent['dayHint'],
  timeZone: string,
  now: Date,
): { windowStart?: string; windowEnd?: string } {
  if (dayHint === null) return {};

  const dayStart =
    dayHint === 'tomorrow' ? addZonedDays(startOfZonedDay(now, timeZone), 1, timeZone) : now;
  const dayEnd = addZonedDays(startOfZonedDay(dayStart, timeZone), 1, timeZone);

  return { windowStart: dayStart.toISOString(), windowEnd: dayEnd.toISOString() };
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
