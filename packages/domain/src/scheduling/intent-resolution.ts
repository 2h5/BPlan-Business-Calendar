import {
  isValidCalendarDate,
  type DateIntent,
  type DurationIntent,
  type SchedulingIntent,
  type TimeIntent,
  type TimeOfDayPreference,
} from '@cal/schemas/scheduling';

import {
  addZonedDays,
  getZonedParts,
  startOfZonedDay,
  zonedWallClockToUtc,
} from '../time/timezone.ts';

const WEEKDAY_NAME_TO_NUMBER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const WEEKDAY_NAMES_TITLE: Record<string, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

export const DEFAULT_INTENT_DURATION_MINUTES = 30;

export interface ResolvedIntentDuration {
  durationMinutes: number;
  maxDurationMinutes?: number;
  allowedDurationsMinutes?: number[];
}

/**
 * Deterministic policy for converting a duration intent into candidate durations.
 * - Exact & approximate: single duration.
 * - Null / unspecified: default 30 minutes.
 * - Range: bounded range [min, max]. If gap >= 30m, generates midpoint on 15m grid
 *   yielding [min, mid, max] (e.g. 1-2 hours -> [60, 90, 120]); if gap < 30m, yields [min, max].
 */
export function resolveIntentDuration(duration: DurationIntent | null): ResolvedIntentDuration {
  if (duration === null) {
    return { durationMinutes: DEFAULT_INTENT_DURATION_MINUTES };
  }

  if (duration.type === 'exact' || duration.type === 'approximate') {
    return { durationMinutes: duration.minutes };
  }

  const { minMinutes, maxMinutes } = duration;
  const gap = maxMinutes - minMinutes;

  if (gap < 30) {
    return {
      durationMinutes: minMinutes,
      maxDurationMinutes: maxMinutes,
      allowedDurationsMinutes: [minMinutes, maxMinutes],
    };
  }

  const rawMid = (minMinutes + maxMinutes) / 2;
  const mid = Math.round(rawMid / 15) * 15;

  if (mid > minMinutes && mid < maxMinutes) {
    return {
      durationMinutes: minMinutes,
      maxDurationMinutes: maxMinutes,
      allowedDurationsMinutes: [minMinutes, mid, maxMinutes],
    };
  }

  return {
    durationMinutes: minMinutes,
    maxDurationMinutes: maxMinutes,
    allowedDurationsMinutes: [minMinutes, maxMinutes],
  };
}

export interface ResolvedIntentDateWindow {
  windowStart: Date;
  windowEnd: Date;
  placementPreference?: 'early' | 'middle' | 'late' | 'any';
  isPast?: boolean;
  isImpossibleDate?: boolean;
}

/**
 * Deterministically resolves date intent into UTC window boundaries using user's timezone.
 * Never invents dates or trusts arbitrary model timestamps for relative expressions.
 */
export function resolveIntentDateWindow(
  dateIntent: DateIntent,
  timeZone: string,
  now: Date,
): ResolvedIntentDateWindow {
  const currentParts = getZonedParts(now, timeZone);
  const todayStart = startOfZonedDay(now, timeZone);

  switch (dateIntent.type) {
    case 'unconstrained': {
      return {
        windowStart: now,
        windowEnd: addZonedDays(now, 7, timeZone),
      };
    }

    case 'today': {
      return {
        windowStart: now,
        windowEnd: addZonedDays(todayStart, 1, timeZone),
      };
    }

    case 'tomorrow': {
      const tomorrowStart = addZonedDays(todayStart, 1, timeZone);
      return {
        windowStart: tomorrowStart,
        windowEnd: addZonedDays(tomorrowStart, 1, timeZone),
      };
    }

    case 'weekday': {
      const targetDayNumber = WEEKDAY_NAME_TO_NUMBER[dateIntent.weekday] ?? 1;
      const currentDayNumber = currentParts.weekday;
      let daysToAdd = (targetDayNumber - currentDayNumber + 7) % 7;

      if (dateIntent.modifier === 'next') {
        if (targetDayNumber > currentDayNumber) {
          // e.g. Monday looking at Friday: "next Friday" skips this week's Friday
          daysToAdd += 7;
        } else if (daysToAdd === 0) {
          // e.g. Tuesday looking at "next Tuesday"
          daysToAdd = 7;
        }
        // When targetDayNumber < currentDayNumber (e.g. Wednesday looking at Tuesday),
        // daysToAdd is ALREADY 6 days away (in next week), so no extra 7 is needed.
      } else if (daysToAdd === 0) {
        // "Friday" or "this Friday" when today is already Friday
        return {
          windowStart: now,
          windowEnd: addZonedDays(todayStart, 1, timeZone),
        };
      }

      const targetDayStart = addZonedDays(todayStart, daysToAdd, timeZone);
      return {
        windowStart: targetDayStart,
        windowEnd: addZonedDays(targetDayStart, 1, timeZone),
      };
    }

    case 'weekend': {
      // Saturday is 6, Sunday is 0
      const currentDayNumber = currentParts.weekday;
      const placementPreference = dateIntent.preference ?? 'any';

      if (dateIntent.modifier === 'next') {
        let daysUntilNextSaturday = (6 - currentDayNumber + 7) % 7;
        if (daysUntilNextSaturday === 0) daysUntilNextSaturday = 7;
        else daysUntilNextSaturday += 7;
        const saturdayStart = addZonedDays(todayStart, daysUntilNextSaturday, timeZone);
        const mondayStart = addZonedDays(saturdayStart, 2, timeZone);
        return { windowStart: saturdayStart, windowEnd: mondayStart, placementPreference };
      }

      // "this weekend" / "weekend"
      if (currentDayNumber === 6) {
        // Today is Saturday: start now, end at Monday start
        const mondayStart = addZonedDays(todayStart, 2, timeZone);
        return { windowStart: now, windowEnd: mondayStart, placementPreference };
      }

      if (currentDayNumber === 0) {
        // Today is Sunday: start now, end at Monday start
        const mondayStart = addZonedDays(todayStart, 1, timeZone);
        return { windowStart: now, windowEnd: mondayStart, placementPreference };
      }

      // Sunday to Friday: find this upcoming Saturday
      const daysUntilSaturday = (6 - currentDayNumber + 7) % 7;
      const saturdayStart = addZonedDays(todayStart, daysUntilSaturday, timeZone);
      const mondayStart = addZonedDays(saturdayStart, 2, timeZone);
      return { windowStart: saturdayStart, windowEnd: mondayStart, placementPreference };
    }

    case 'relative_week': {
      const currentDayNumber = currentParts.weekday;
      const daysUntilNextMonday = (1 - currentDayNumber + 7) % 7 || 7;
      const nextMondayStart = addZonedDays(todayStart, daysUntilNextMonday, timeZone);
      const placementPreference = dateIntent.preference ?? 'any';

      if (dateIntent.modifier === 'next') {
        const followingMondayStart = addZonedDays(nextMondayStart, 7, timeZone);
        return {
          windowStart: nextMondayStart,
          windowEnd: followingMondayStart,
          placementPreference,
        };
      }

      // "this week"
      return {
        windowStart: now,
        windowEnd: nextMondayStart,
        placementPreference,
      };
    }

    case 'explicit_date': {
      if (!isValidCalendarDate(dateIntent.date)) {
        return {
          windowStart: now,
          windowEnd: now,
          isImpossibleDate: true,
        };
      }
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIntent.date)!;
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const dateUtc = zonedWallClockToUtc({ year, month, day, hour: 0, minute: 0 }, timeZone);
      const dayStart = startOfZonedDay(dateUtc, timeZone);
      const dayEnd = addZonedDays(dayStart, 1, timeZone);
      const isPast = dayEnd.getTime() <= now.getTime();
      return {
        windowStart: dayStart.getTime() < now.getTime() ? now : dayStart,
        windowEnd: dayEnd,
        isPast,
      };
    }
  }
}

export interface ResolvedIntentTimeBounds {
  earliestMinute?: number;
  latestMinute?: number;
  preferredTimeOfDay: TimeOfDayPreference;
  noteHint?: string;
}

/**
 * Maps time intent into deterministic minute-of-day constraints and ranking preferences.
 * Hard constraints: exact_time, after_time, before_time, between_times.
 * Soft preferences: around_time, time_of_day.
 */
export function resolveIntentTimeBounds(
  timeIntent: TimeIntent,
  durationMinutes: number,
  maxDurationMinutes?: number,
): ResolvedIntentTimeBounds {
  switch (timeIntent.type) {
    case 'unconstrained':
      return { preferredTimeOfDay: 'any' };

    case 'time_of_day':
      return { preferredTimeOfDay: timeIntent.preference };

    case 'exact_time': {
      const span =
        maxDurationMinutes !== undefined && maxDurationMinutes > durationMinutes
          ? maxDurationMinutes
          : durationMinutes;
      const minute = timeIntent.hour * 60 + timeIntent.minute;
      return {
        earliestMinute: minute,
        latestMinute: Math.min(24 * 60, minute + span),
        preferredTimeOfDay: timeOfDayFromHour(timeIntent.hour),
        noteHint: `Scheduled for exact time ${formatClockTime(timeIntent.hour, timeIntent.minute)}`,
      };
    }

    case 'around_time': {
      // Soft preference: does not exclude slots outside exact minute, sets preferred time of day and hint
      return {
        preferredTimeOfDay: timeOfDayFromHour(timeIntent.hour),
        noteHint: `User preferred time around ${formatClockTime(timeIntent.hour, timeIntent.minute)}`,
      };
    }

    case 'after_time': {
      const minute = timeIntent.hour * 60 + timeIntent.minute;
      return {
        earliestMinute: minute,
        preferredTimeOfDay: timeOfDayFromHour(timeIntent.hour),
        noteHint: `Must be after ${formatClockTime(timeIntent.hour, timeIntent.minute)}`,
      };
    }

    case 'before_time': {
      const minute = timeIntent.hour * 60 + timeIntent.minute;
      return {
        latestMinute: minute,
        preferredTimeOfDay: timeOfDayFromHour(Math.max(0, timeIntent.hour - 2)),
        noteHint: `Must be before ${formatClockTime(timeIntent.hour, timeIntent.minute)}`,
      };
    }

    case 'between_times': {
      const startMinute = timeIntent.startHour * 60 + timeIntent.startMinute;
      const endMinute = timeIntent.endHour * 60 + timeIntent.endMinute;
      return {
        earliestMinute: startMinute,
        latestMinute: endMinute,
        preferredTimeOfDay: timeOfDayFromHour(timeIntent.startHour),
        noteHint: `Between ${formatClockTime(timeIntent.startHour, timeIntent.startMinute)} and ${formatClockTime(timeIntent.endHour, timeIntent.endMinute)}`,
      };
    }
  }
}

export function timeOfDayFromHour(hour: number): TimeOfDayPreference {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function formatClockTime(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = minute.toString().padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

/** Formats a duration into human text (e.g. "1 hr 30 min", "45 min", "1 hr – 2 hr"). */
export function formatIntentDurationLabel(duration: DurationIntent | null): string {
  if (!duration) return '30 min';
  if (duration.type === 'exact') return formatDurationText(duration.minutes);
  if (duration.type === 'approximate') return `${formatDurationText(duration.minutes)} (approx)`;
  return `${formatDurationText(duration.minMinutes)} – ${formatDurationText(duration.maxMinutes)}`;
}

export function formatDurationText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return hours === 1 ? '1 hr' : `${hours} hrs`;
  return `${hours} hr ${remainingMinutes} min`;
}

/** Formats date intent into concise human-facing readback text. */
export function formatIntentDateLabel(dateIntent: DateIntent): string | null {
  switch (dateIntent.type) {
    case 'unconstrained':
      return null;
    case 'today':
      return 'Today';
    case 'tomorrow':
      return 'Tomorrow';
    case 'weekday': {
      const name = WEEKDAY_NAMES_TITLE[dateIntent.weekday] ?? dateIntent.weekday;
      return dateIntent.modifier === 'next' ? `Next ${name}` : name;
    }
    case 'weekend': {
      const isNext = dateIntent.modifier === 'next';
      if (dateIntent.preference === 'late') {
        return isNext ? 'End of next weekend' : 'End of this weekend';
      }
      if (dateIntent.preference === 'early') {
        return isNext ? 'Early next weekend' : 'Early this weekend';
      }
      return isNext ? 'Next weekend' : 'This weekend';
    }
    case 'relative_week': {
      const isNext = dateIntent.modifier === 'next';
      if (dateIntent.preference === 'late') {
        return isNext ? 'Later next week' : 'Later this week';
      }
      if (dateIntent.preference === 'early') {
        return isNext ? 'Early next week' : 'Early this week';
      }
      if (dateIntent.preference === 'middle') {
        return isNext ? 'Mid next week' : 'Mid this week';
      }
      return isNext ? 'Next week' : 'This week';
    }
    case 'explicit_date':
      return dateIntent.date;
  }
}

/** Formats time intent into concise human-facing readback text. */
export function formatIntentTimeLabel(timeIntent: TimeIntent): string | null {
  switch (timeIntent.type) {
    case 'unconstrained':
      return null;
    case 'time_of_day':
      return timeIntent.preference.charAt(0).toUpperCase() + timeIntent.preference.slice(1);
    case 'exact_time':
      return `At ${formatClockTime(timeIntent.hour, timeIntent.minute)}`;
    case 'around_time':
      return `Around ${formatClockTime(timeIntent.hour, timeIntent.minute)}`;
    case 'after_time':
      return `After ${formatClockTime(timeIntent.hour, timeIntent.minute)}`;
    case 'before_time':
      return `Before ${formatClockTime(timeIntent.hour, timeIntent.minute)}`;
    case 'between_times':
      return `${formatClockTime(timeIntent.startHour, timeIntent.startMinute)} – ${formatClockTime(timeIntent.endHour, timeIntent.endMinute)}`;
  }
}

/** Generates clean readback metadata for the UI from interpreted intent. */
export function generateIntentReadback(intent: SchedulingIntent): {
  title: string;
  durationMinutes: number | null;
  durationLabel: string;
  dateLabel: string | null;
  timeLabel: string | null;
  location: string | null;
} {
  const resolvedDuration = resolveIntentDuration(intent.duration);
  return {
    title: intent.title,
    durationMinutes: intent.duration ? resolvedDuration.durationMinutes : null,
    durationLabel: formatIntentDurationLabel(intent.duration),
    dateLabel: formatIntentDateLabel(intent.date),
    timeLabel: formatIntentTimeLabel(intent.time),
    location: intent.location,
  };
}
