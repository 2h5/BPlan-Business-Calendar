import type { Calendar, CalendarEvent, TaskList } from '@cal/schemas';

import { buildIlikeOrFilter, sanitizeSearchQuery, searchIlikePattern } from './search-query';
import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';
import { calendarRowSchema, eventRowSchema } from '../../calendar/api/calendar-mappers';
import { EVENT_COLUMNS } from '../../calendar/api/calendar.api';
import {
  TASK_COLUMNS,
  taskListRowSchema,
  taskRowSchema,
  type TaskWithTags,
} from '../../tasks/api/tasks.api';

export interface SearchResults {
  events: CalendarEvent[];
  tasks: TaskWithTags[];
  calendars: Calendar[];
  lists: TaskList[];
}

export async function searchEverything(query: string): Promise<SearchResults> {
  const safeQuery = sanitizeSearchQuery(query);
  if (safeQuery.length < 2) return { events: [], tasks: [], calendars: [], lists: [] };
  const pattern = searchIlikePattern(safeQuery);

  const [eventsResult, tasksResult, calendarsResult, listsResult] = await Promise.all([
    supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .neq('status', 'cancelled')
      .or(buildIlikeOrFilter(['title', 'description', 'location'], safeQuery))
      .order('start_at', { ascending: false })
      .limit(40),
    supabase
      .from('tasks')
      .select(`${TASK_COLUMNS}, task_tags(tag_id)`)
      .neq('status', 'archived')
      .or(buildIlikeOrFilter(['title', 'description'], safeQuery))
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase.from('calendars').select('*').ilike('name', pattern).order('name').limit(12),
    supabase.from('task_lists').select('*').ilike('name', pattern).order('position').limit(12),
  ]);

  for (const result of [eventsResult, tasksResult, calendarsResult, listsResult]) {
    if (result.error) throw toAppError(result.error);
  }

  const tasks = (tasksResult.data ?? []).map((row) => {
    const { task_tags: taskTags, ...task } = row as unknown as Record<string, unknown> & {
      task_tags?: { tag_id: string }[];
    };
    return { ...taskRowSchema.parse(task), tagIds: (taskTags ?? []).map((link) => link.tag_id) };
  });

  return {
    events: (eventsResult.data ?? []).map((row) => eventRowSchema.parse(row)),
    tasks,
    calendars: (calendarsResult.data ?? []).map((row) => calendarRowSchema.parse(row)),
    lists: (listsResult.data ?? []).map((row) => taskListRowSchema.parse(row)),
  };
}
