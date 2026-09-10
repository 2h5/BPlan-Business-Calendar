import { z } from 'zod';

export const weekdayNameSchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export type WeekdayName = z.infer<typeof weekdayNameSchema>;

export const relativeModifierSchema = z.enum(['this', 'next', 'none']);
export type RelativeModifier = z.infer<typeof relativeModifierSchema>;

export const durationExactSchema = z
  .object({
    type: z.literal('exact'),
    minutes: z.number().int().min(5).max(720),
  })
  .strict();

export const durationApproximateSchema = z
  .object({
    type: z.literal('approximate'),
    minutes: z.number().int().min(5).max(720),
  })
  .strict();

export const durationRangeSchema = z
  .object({
    type: z.literal('range'),
    minMinutes: z.number().int().min(5).max(720),
    maxMinutes: z.number().int().min(5).max(720),
  })
  .strict();

export const durationIntentSchema = z
  .discriminatedUnion('type', [durationExactSchema, durationApproximateSchema, durationRangeSchema])
  .refine((data) => data.type !== 'range' || data.maxMinutes > data.minMinutes, {
    message: 'maxMinutes must be greater than minMinutes',
    path: ['maxMinutes'],
  });

export type DurationIntent = z.infer<typeof durationIntentSchema>;

export const dateIntentUnconstrainedSchema = z
  .object({
    type: z.literal('unconstrained'),
  })
  .strict();

export const dateIntentTodaySchema = z
  .object({
    type: z.literal('today'),
  })
  .strict();

export const dateIntentTomorrowSchema = z
  .object({
    type: z.literal('tomorrow'),
  })
  .strict();

export const dateIntentWeekdaySchema = z
  .object({
    type: z.literal('weekday'),
    weekday: weekdayNameSchema,
    modifier: relativeModifierSchema.default('none'),
  })
  .strict();

/**
 * Verifies that a YYYY-MM-DD string is an authentic calendar date that does
 * not wrap or overflow (e.g. rejects 2026-02-30, 2026-04-31, 2026-13-45).
 */
export function isValidCalendarDate(dateString: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export const datePreferenceSchema = z.enum(['early', 'middle', 'late', 'any']);
export type DatePreference = z.infer<typeof datePreferenceSchema>;

export const dateIntentWeekendSchema = z
  .object({
    type: z.literal('weekend'),
    modifier: relativeModifierSchema.default('none'),
    preference: z.enum(['early', 'late', 'any']).default('any'),
  })
  .strict();

export const dateIntentRelativeWeekSchema = z
  .object({
    type: z.literal('relative_week'),
    modifier: z.enum(['this', 'next']).default('this'),
    preference: datePreferenceSchema.default('any'),
  })
  .strict();

export const dateIntentExplicitSchema = z
  .object({
    type: z.literal('explicit_date'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
      .refine(isValidCalendarDate, { message: 'Date must be a valid calendar date' }),
  })
  .strict();

/**
 * A named week identified by a date inside it, e.g. "the week of the 21st".
 * The whole week is the window; the date only says which week is meant.
 */
export const dateIntentWeekOfSchema = z
  .object({
    type: z.literal('week_of'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format')
      .refine(isValidCalendarDate, { message: 'Date must be a valid calendar date' }),
    preference: datePreferenceSchema.default('any'),
  })
  .strict();

export const dateIntentSchema = z.discriminatedUnion('type', [
  dateIntentUnconstrainedSchema,
  dateIntentTodaySchema,
  dateIntentTomorrowSchema,
  dateIntentWeekdaySchema,
  dateIntentWeekendSchema,
  dateIntentRelativeWeekSchema,
  dateIntentExplicitSchema,
  dateIntentWeekOfSchema,
]);
export type DateIntent = z.infer<typeof dateIntentSchema>;

export const timeIntentUnconstrainedSchema = z
  .object({
    type: z.literal('unconstrained'),
  })
  .strict();

export const timeIntentExactSchema = z
  .object({
    type: z.literal('exact_time'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();

export const timeIntentAroundSchema = z
  .object({
    type: z.literal('around_time'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();

export const timeIntentAfterSchema = z
  .object({
    type: z.literal('after_time'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();

export const timeIntentBeforeSchema = z
  .object({
    type: z.literal('before_time'),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .strict();

export const timeIntentBetweenSchema = z
  .object({
    type: z.literal('between_times'),
    startHour: z.number().int().min(0).max(23),
    startMinute: z.number().int().min(0).max(59),
    endHour: z.number().int().min(0).max(23),
    endMinute: z.number().int().min(0).max(59),
  })
  .strict();

export const timeIntentTimeOfDaySchema = z
  .object({
    type: z.literal('time_of_day'),
    preference: z.enum(['morning', 'afternoon', 'evening']),
  })
  .strict();

export const timeIntentSchema = z
  .discriminatedUnion('type', [
    timeIntentUnconstrainedSchema,
    timeIntentExactSchema,
    timeIntentAroundSchema,
    timeIntentAfterSchema,
    timeIntentBeforeSchema,
    timeIntentBetweenSchema,
    timeIntentTimeOfDaySchema,
  ])
  .refine(
    (d) =>
      d.type !== 'between_times' || d.endHour * 60 + d.endMinute > d.startHour * 60 + d.startMinute,
    {
      message: 'End time must be after start time',
      path: ['endHour'],
    },
  );

export type TimeIntent = z.infer<typeof timeIntentSchema>;

/**
 * Strict production-quality structured intent contract returned by Luna intent parsing.
 * Validated with Zod before touching any domain availability or persistence code.
 */
export const schedulingIntentSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    duration: durationIntentSchema.nullable(),
    date: dateIntentSchema,
    time: timeIntentSchema,
    location: z.string().trim().min(1).max(200).nullable(),
    description: z.string().trim().min(1).max(500).nullable(),
    requiresClarification: z.boolean(),
    clarificationQuestion: z.string().trim().min(1).max(300).nullable(),
  })
  .strict()
  .refine((intent) => !intent.requiresClarification || intent.clarificationQuestion !== null, {
    message: 'A clarification question is required when requiresClarification is true',
    path: ['clarificationQuestion'],
  });

export type SchedulingIntent = z.infer<typeof schedulingIntentSchema>;

export const aiFindTimeClarificationSchema = z
  .object({
    status: z.literal('clarification_required'),
    requestId: z.string().min(1),
    clarificationQuestion: z.string().min(1),
    intent: schedulingIntentSchema.optional(),
  })
  .strict();

export type AiFindTimeClarification = z.infer<typeof aiFindTimeClarificationSchema>;

export const aiFindTimeReadbackSchema = z
  .object({
    title: z.string(),
    durationMinutes: z.number().int().nullable(),
    durationLabel: z.string(),
    dateLabel: z.string().nullable(),
    timeLabel: z.string().nullable(),
    location: z.string().nullable(),
  })
  .strict();

export type AiFindTimeReadback = z.infer<typeof aiFindTimeReadbackSchema>;
