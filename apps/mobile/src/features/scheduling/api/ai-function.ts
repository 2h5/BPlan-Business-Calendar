import { z } from 'zod';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/**
 * Preserve the stable Edge Function error codes (AI_NO_VALID_SLOT,
 * SUBSCRIPTION_REQUIRED, ...) the box needs to explain what happened.
 */
export async function invokeAiFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
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
