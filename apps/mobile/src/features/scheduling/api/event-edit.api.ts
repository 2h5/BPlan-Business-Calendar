import { aiEventEditResponseSchema, type AiEventEditResponse } from '@cal/schemas/scheduling';

import { invokeAiFunction } from './ai-function';

export type { AiEventEditResponse, AiEventMoveOption } from '@cal/schemas/scheduling';

/**
 * Asks the server how a sentence like "move Vermont to Saturday" would change
 * the calendar. Nothing is written here: the server matches the event and
 * computes the new times, and the user confirms before anything is saved.
 */
export async function proposeEventEdit(text: string): Promise<AiEventEditResponse> {
  return aiEventEditResponseSchema.parse(await invokeAiFunction('ai-edit-event', { text }));
}
