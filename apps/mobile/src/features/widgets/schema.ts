import { z } from 'zod';

import { WIDGET_SNAPSHOT_VERSION } from './constants';

/**
 * The snapshot the Home Screen widget renders.
 *
 * Everything that needs the user's time zone, clock preference, or calendar
 * rules is resolved here in TypeScript, through `@cal/domain`. The Swift side
 * only draws: it never expands a recurrence, picks a colour, or formats a time.
 * The only date maths it does is "which day is it now", so a widget left alone
 * overnight still moves on to the next day in the snapshot.
 */

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hexSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const widgetEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Epoch milliseconds, so Swift can tell past, now, and next without parsing. */
  start: z.number(),
  end: z.number(),
  allDay: z.boolean(),
  /** e.g. "09:30" or "9:30 AM"; empty for all-day events. */
  startLabel: z.string(),
  endLabel: z.string(),
  color: hexSchema,
  location: z.string().nullable(),
  /**
   * Where the event sits in this day, in minutes from local midnight, clipped
   * to the day: an event from yesterday starts at 0, one running past
   * midnight ends at 1440. The Week view's time grid places blocks by these.
   */
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

export const widgetTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  overdue: z.boolean(),
  /** A notable priority — urgent or high — earns a flag in the row. */
  flagged: z.boolean(),
  /** "14:30" for a timed task due today; null otherwise. */
  dueLabel: z.string().nullable(),
});

export const widgetDaySchema = z.object({
  key: dateKeySchema,
  /** "Friday" */
  weekday: z.string(),
  /** "2 October" */
  dateLabel: z.string(),
  events: z.array(widgetEventSchema),
});

export const widgetMonthCellSchema = z.object({
  key: dateKeySchema,
  day: z.number().int(),
  inMonth: z.boolean(),
  /** Up to three distinct event colours, for the dots under the number. */
  colors: z.array(hexSchema),
  count: z.number().int(),
  /** The first events, for the extra-large grid's title chips. */
  chips: z.array(z.object({ title: z.string(), color: hexSchema })),
});

export const widgetMonthSchema = z.object({
  /** "2026-10" */
  key: z.string().regex(/^\d{4}-\d{2}$/),
  /** "October" */
  title: z.string(),
  year: z.string(),
  /** Six weeks of seven cells, starting on the user's week start. */
  weeks: z.array(z.array(widgetMonthCellSchema).length(7)).length(6),
});

export const widgetWeekSchema = z.object({
  /** The first day's key. */
  key: dateKeySchema,
  /** "28 Sep – 4 Oct" */
  label: z.string(),
  /** Seven day keys in display order; each has an entry in `days`. */
  days: z.array(dateKeySchema).length(7),
});

export const widgetSnapshotSchema = z.object({
  version: z.literal(WIDGET_SNAPSHOT_VERSION),
  generatedAt: z.string(),
  timeZone: z.string(),
  /** The user's clock, for the Week view's hour labels. */
  hourCycle: z.enum(['h12', 'h23']),
  /** Single-letter headings in display order, e.g. ["M","T","W","T","F","S","S"]. */
  weekdayLabels: z.array(z.string()).length(7),
  months: z.array(widgetMonthSchema),
  /** This week and the next. */
  weeks: z.array(widgetWeekSchema),
  /** From the start of this week to two weeks from today. */
  days: z.array(widgetDaySchema),
  tasks: z.array(widgetTaskSchema),
  /** Open tasks beyond the ones listed, so the widget can say "+3 more". */
  moreTaskCount: z.number().int(),
});

export type WidgetEvent = z.infer<typeof widgetEventSchema>;
export type WidgetTask = z.infer<typeof widgetTaskSchema>;
export type WidgetDay = z.infer<typeof widgetDaySchema>;
export type WidgetMonthCell = z.infer<typeof widgetMonthCellSchema>;
export type WidgetMonth = z.infer<typeof widgetMonthSchema>;
export type WidgetWeek = z.infer<typeof widgetWeekSchema>;
export type WidgetSnapshot = z.infer<typeof widgetSnapshotSchema>;

/** A tick made on the Home Screen, written by the widget's ToggleTaskIntent. */
export const pendingTaskToggleSchema = z.object({
  id: z.string().uuid(),
  completed: z.boolean(),
  /** Epoch seconds, as Swift's `Date().timeIntervalSince1970`. */
  at: z.number(),
});

export const pendingTaskTogglesSchema = z.array(pendingTaskToggleSchema);

export type PendingTaskToggle = z.infer<typeof pendingTaskToggleSchema>;
