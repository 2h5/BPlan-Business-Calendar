import { z } from 'zod';

import { dateIntentSchema, timeIntentSchema } from './intent.schema.ts';
import { isoDateTimeSchema, uuidSchema } from './primitives.ts';

/**
 * What the model may say about a request to move an existing event.
 *
 * It names the event in the user's own words and restates the dates and times
 * as intents — never as timestamps. Which event those words mean, and which
 * instants the new day and time are, is decided by deterministic code.
 */
export const eventEditIntentSchema = z
  .object({
    /** The words that identify the event, e.g. "weekend in Vermont". */
    eventQuery: z.string().trim().min(1).max(200),
    /** When the event is now, if the user said ("my Friday dentist"). */
    currentDate: dateIntentSchema.nullable(),
    /** The day it should move to, if the user named one. */
    newDate: dateIntentSchema.nullable(),
    /** The time it should start at, if the user named one. */
    newTime: timeIntentSchema.nullable(),
    requiresClarification: z.boolean(),
    clarificationQuestion: z.string().trim().min(1).max(300).nullable(),
  })
  .strict()
  .refine((intent) => !intent.requiresClarification || intent.clarificationQuestion !== null, {
    message: 'A clarification question is required when requiresClarification is true',
    path: ['clarificationQuestion'],
  });

export type EventEditIntent = z.infer<typeof eventEditIntentSchema>;

export const aiEventEditRequestSchema = z
  .object({
    /** Raw natural language typed into the AI bar ("move Vermont to Saturday"). */
    text: z.string().trim().min(1).max(500),
  })
  .strict();

export type AiEventEditRequest = z.infer<typeof aiEventEditRequestSchema>;

/** One concrete, already-computed move the user can confirm. */
export const aiEventMoveOptionSchema = z
  .object({
    eventId: uuidSchema,
    title: z.string(),
    calendarName: z.string(),
    allDay: z.boolean(),
    before: z.object({ startAt: isoDateTimeSchema, endAt: isoDateTimeSchema }).strict(),
    after: z.object({ startAt: isoDateTimeSchema, endAt: isoDateTimeSchema }).strict(),
  })
  .strict();

export type AiEventMoveOption = z.infer<typeof aiEventMoveOptionSchema>;

export const aiEventEditResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('proposed'),
      requestId: uuidSchema,
      /** Best match first. More than one means the user picks which event. */
      options: z.array(aiEventMoveOptionSchema).min(1).max(5),
    })
    .strict(),
  z
    .object({
      status: z.literal('clarification_required'),
      requestId: uuidSchema,
      clarificationQuestion: z.string().min(1),
    })
    .strict(),
]);

export type AiEventEditResponse = z.infer<typeof aiEventEditResponseSchema>;
