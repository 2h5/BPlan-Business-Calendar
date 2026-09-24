import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { EdgeError } from '../errors/index.ts';

/** An event the AI bar may move: the user's own, one-off, on a writable calendar. */
export interface EditableEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string | null;
  calendarName: string;
}

export interface EventEditDataSource {
  loadTimezone(userId: string): Promise<string | null>;
  /**
   * Events whose title contains any of `words` and which overlap [from, to).
   * A coarse prefilter: ranking decides which of them the phrase really means.
   */
  findCandidateEvents(
    userId: string,
    words: readonly string[],
    from: Date,
    to: Date,
  ): Promise<EditableEvent[]>;
}

const CANDIDATE_LIMIT = 200;

const eventRowSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    start_at: z.string(),
    end_at: z.string(),
    all_day: z.boolean(),
    timezone: z.string().nullable(),
    calendars: z.object({ name: z.string() }).passthrough(),
  })
  .passthrough();

export function supabaseEventEditDataSource(admin: SupabaseClient): EventEditDataSource {
  return {
    async loadTimezone(userId) {
      const { data, error } = await admin
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw databaseReadError('planning preferences', error.code);
      const parsed = z.object({ timezone: z.string() }).nullable().safeParse(data);
      return parsed.success ? (parsed.data?.timezone ?? null) : null;
    },

    async findCandidateEvents(userId, words, from, to) {
      if (words.length === 0) return [];

      // Words are already [a-z0-9]+ (see eventQueryWords), so they cannot alter
      // the PostgREST expression. A shortened stem lets "meetings" still find
      // "Meeting"; ranking re-checks every match.
      const clauses = words
        .map((word) => word.slice(0, Math.max(3, word.length - 2)))
        .map((stem) => `title.ilike.%${stem}%`)
        .join(',');

      const { data, error } = await admin
        .from('events')
        .select(
          'id, title, start_at, end_at, all_day, timezone, calendars!inner(name, is_read_only)',
        )
        .eq('user_id', userId)
        .neq('status', 'cancelled')
        // Recurring series and their occurrences are out of scope: moving one
        // needs a "this or all" choice the confirmation card does not offer.
        .is('recurrence_rule', null)
        .is('recurring_event_id', null)
        .eq('calendars.is_read_only', false)
        .lt('start_at', to.toISOString())
        .gt('end_at', from.toISOString())
        .or(clauses)
        .order('start_at')
        .limit(CANDIDATE_LIMIT);
      if (error) throw databaseReadError('calendar events', error.code);

      return (data ?? []).flatMap((row) => {
        const parsed = eventRowSchema.safeParse(row);
        if (!parsed.success) return [];
        const event = parsed.data;
        return [
          {
            id: event.id,
            title: event.title,
            startAt: event.start_at,
            endAt: event.end_at,
            allDay: event.all_day,
            timezone: event.timezone,
            calendarName: event.calendars.name,
          },
        ];
      });
    },
  };
}

function databaseReadError(resource: string, detail: string | undefined): EdgeError {
  console.error(JSON.stringify({ code: 'AI_EDIT_CONTEXT_READ_FAILED', resource, detail }));
  return new EdgeError('UNKNOWN', `Could not load ${resource}.`, 500);
}
