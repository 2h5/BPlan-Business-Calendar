/**
 * The sample week the product page's demos play out. Times are minutes from
 * local midnight on a fixed, timezone-free week so every visitor sees the
 * same calendar; demos that call the domain engine convert through
 * `demoInstant`, which pins the week to UTC.
 */

export const DEMO_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const DEMO_DATES = [5, 6, 7, 8, 9] as const;
/** Tuesday: the day the single-day demos focus on. */
export const DEMO_TODAY = 1;
/** Minutes past midnight the demos treat as "now" (Tuesday, 11:40 AM). */
export const DEMO_NOW = 11 * 60 + 40;

/** The visible slice of the day in timeline demos. */
export const DAY_START = 8 * 60;
export const DAY_END = 18 * 60;

/** Soft calendar colours, taken from the app's own palette. */
export const DEMO_COLORS = {
  sky: '#B2E0EF',
  periwinkle: '#9CB9F6',
  lavender: '#C9B1F4',
  mint: '#96EFCC',
  apricot: '#FBBE7E',
  pink: '#FAB2C3',
} as const;

export type DemoColor = keyof typeof DEMO_COLORS;

export interface DemoEvent {
  id: string;
  day: number;
  start: number;
  end: number;
  title: string;
  color: DemoColor;
}

const at = (hour: number, minute = 0) => hour * 60 + minute;

export const DEMO_EVENTS: readonly DemoEvent[] = [
  { id: 'mon-standup', day: 0, start: at(9), end: at(9, 30), title: 'Standup', color: 'sky' },
  {
    id: 'mon-roadmap',
    day: 0,
    start: at(11),
    end: at(12, 30),
    title: 'Roadmap review',
    color: 'periwinkle',
  },
  { id: 'mon-1on1', day: 0, start: at(15), end: at(16), title: '1:1 with Priya', color: 'mint' },
  { id: 'tue-standup', day: 1, start: at(9), end: at(9, 30), title: 'Standup', color: 'sky' },
  { id: 'tue-deep', day: 1, start: at(10), end: at(11, 30), title: 'Deep work', color: 'lavender' },
  {
    id: 'tue-lunch',
    day: 1,
    start: at(13),
    end: at(14),
    title: 'Lunch with Maya',
    color: 'mint',
  },
  {
    id: 'tue-design',
    day: 1,
    start: at(14, 30),
    end: at(15, 30),
    title: 'Design review',
    color: 'pink',
  },
  { id: 'wed-standup', day: 2, start: at(9), end: at(9, 30), title: 'Standup', color: 'sky' },
  { id: 'wed-gym', day: 2, start: at(12), end: at(13), title: 'Gym', color: 'mint' },
  {
    id: 'wed-hiring',
    day: 2,
    start: at(16),
    end: at(17),
    title: 'Hiring sync',
    color: 'periwinkle',
  },
  { id: 'thu-standup', day: 3, start: at(9), end: at(9, 30), title: 'Standup', color: 'sky' },
  {
    id: 'thu-workshop',
    day: 3,
    start: at(10, 30),
    end: at(12),
    title: 'Workshop',
    color: 'lavender',
  },
  {
    id: 'thu-customer',
    day: 3,
    start: at(14),
    end: at(15),
    title: 'Customer call',
    color: 'apricot',
  },
  { id: 'fri-standup', day: 4, start: at(9), end: at(9, 30), title: 'Standup', color: 'sky' },
  {
    id: 'fri-planning',
    day: 4,
    start: at(11),
    end: at(12),
    title: 'Sprint planning',
    color: 'periwinkle',
  },
  { id: 'fri-focus', day: 4, start: at(15), end: at(16, 30), title: 'Focus block', color: 'sky' },
];

export const eventsOnDay = (day: number) => DEMO_EVENTS.filter((event) => event.day === day);

/** Midnight UTC on the demo Monday, 5 October 2026. */
const WEEK_START_UTC = Date.UTC(2026, 9, 5);

/** A demo day and minute as an instant, for the domain engine. */
export const demoInstant = (day: number, minute: number) =>
  WEEK_START_UTC + day * 86_400_000 + minute * 60_000;

/** The reverse of `demoInstant` for an instant inside the demo week. */
export const demoMinuteOf = (instant: number) =>
  Math.round(((instant - WEEK_START_UTC) % 86_400_000) / 60_000);

/** "2:30 PM" style labels, the app's default twelve-hour clock. */
export function formatDemoTime(minute: number, withPeriod = true): string {
  const hour24 = Math.floor(minute / 60);
  const mins = minute % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const clock = mins === 0 ? `${hour12}` : `${hour12}:${String(mins).padStart(2, '0')}`;
  return withPeriod ? `${clock} ${hour24 < 12 ? 'AM' : 'PM'}` : clock;
}

export function formatDemoDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  return mins === 0 ? `${hours} h` : `${hours} h ${mins} m`;
}

/** Where a minute sits in the visible day, 0–1. */
export const dayFraction = (minute: number) => (minute - DAY_START) / (DAY_END - DAY_START);
