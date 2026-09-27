import {
  type EventMoveFailure,
  eventQueryWords,
  rankEventMatches,
  resolveEventMove,
  resolveIntentDateWindow,
} from '@cal/domain/scheduling';
import { addZonedDays, getZonedParts, startOfZonedDay } from '@cal/domain/time';
import type {
  AiEventEditResponse,
  AiEventMoveOption,
  EventEditIntent,
} from '@cal/schemas/scheduling';

import { EdgeError } from '../errors/index.ts';
import type { EditableEvent, EventEditDataSource } from './event-edit-repository.ts';
import type { AiEventEditIntentProvider, AiEventEditIntentResult } from './event-edit-intent.ts';
import type { AiRequestUpdate, AiScheduleRepository } from './proposal-repository.ts';

/** How far back and ahead an event may be to be found by name. */
const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 366;
const MAX_OPTIONS = 5;

export interface GenerateAiEventEditDeps {
  dataSource: EventEditDataSource;
  repository: AiScheduleRepository;
  createIntentProvider: () => AiEventEditIntentProvider;
  clock?: () => Date;
}

/**
 * "Move my weekend in Vermont to Saturday" → a move the user can confirm.
 *
 * The model restates the sentence as an event phrase and date/time intents.
 * Which events the phrase means, and exactly where each lands, is computed
 * here by `@cal/domain`. Nothing is written: the client confirms one option
 * and saves it through the ordinary event mutation path, which is what routes
 * provider-owned events through the provider first.
 */
export async function generateAiEventEditProposal(
  input: { userId: string; text: string },
  deps: GenerateAiEventEditDeps,
): Promise<AiEventEditResponse> {
  const clock = deps.clock ?? (() => new Date());
  const now = clock();

  // Claim quota before any billable model call; edits share Find Time's limit.
  const requestId = await deps.repository.claimRatedRequest(input.userId, {
    taskId: null,
    rawText: input.text,
  });
  if (requestId === null) {
    throw new EdgeError('AI_RATE_LIMITED', 'AI requests are limited to 10 per hour.', 429);
  }

  let recorded = false;
  const finish = async (patch: AiRequestUpdate) => {
    await deps.repository.updateRequest(input.userId, requestId, {
      requestKind: 'move_event',
      // The raw sentence is only needed until it is parsed.
      rawText: null,
      completedAt: clock().toISOString(),
      ...patch,
    });
    recorded = true;
  };

  try {
    const timeZone = await deps.dataSource.loadTimezone(input.userId);
    if (!timeZone) {
      throw new EdgeError('UNKNOWN', 'Could not load planning preferences.', 500);
    }

    const parts = getZonedParts(now, timeZone);
    const pad = (value: number) => String(value).padStart(2, '0');
    const parsed = await deps.createIntentProvider().parseEventEditIntent({
      rawText: input.text,
      timezone: timeZone,
      currentLocalDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
      currentLocalTime: `${pad(parts.hour)}:${pad(parts.minute)}`,
    });
    const intent = parsed.intent;
    const intentLog = intentUpdate(parsed);

    if (intent.requiresClarification) {
      await finish({
        ...intentLog,
        status: 'failed',
        errorCode: 'AI_CLARIFICATION_REQUIRED',
      });
      return {
        status: 'clarification_required',
        requestId,
        clarificationQuestion:
          intent.clarificationQuestion ?? 'Which event should move, and to when?',
      };
    }

    const candidates = await deps.dataSource.findCandidateEvents(
      input.userId,
      eventQueryWords(intent.eventQuery),
      addZonedDays(startOfZonedDay(now, timeZone), -LOOKBACK_DAYS, timeZone),
      addZonedDays(now, LOOKAHEAD_DAYS, timeZone),
    );
    const ranked = rankEventMatches(
      narrowToCurrentDate(candidates, intent, timeZone, now),
      intent.eventQuery,
      now,
    ).slice(0, MAX_OPTIONS);

    if (ranked.length === 0) {
      await finish({
        ...intentLog,
        status: 'failed',
        errorCode: 'AI_EVENT_NOT_FOUND',
      });
      throw new EdgeError('AI_EVENT_NOT_FOUND', 'No event matches that description.', 404);
    }

    const options: AiEventMoveOption[] = [];
    let firstFailure: { event: EditableEvent; reason: EventMoveFailure } | null = null;

    for (const event of ranked) {
      const move = resolveEventMove({
        event,
        newDate: intent.newDate,
        newTime: intent.newTime,
        // An all-day event's midnights belong to the zone it was made in.
        timeZone: event.allDay && event.timezone ? event.timezone : timeZone,
        now,
      });
      if (!move.ok) {
        firstFailure ??= { event, reason: move.reason };
        continue;
      }
      options.push({
        eventId: event.id,
        title: event.title,
        calendarName: event.calendarName,
        allDay: event.allDay,
        before: { startAt: event.startAt, endAt: event.endAt },
        after: { startAt: move.startAt, endAt: move.endAt },
      });
    }

    if (options.length === 0 && firstFailure) {
      await finish({
        ...intentLog,
        status: 'failed',
        errorCode: 'AI_CLARIFICATION_REQUIRED',
      });
      return {
        status: 'clarification_required',
        requestId,
        clarificationQuestion: questionFor(firstFailure.reason, firstFailure.event.title),
      };
    }

    await finish({
      ...intentLog,
      status: 'proposed',
      candidateCount: options.length,
    });
    return { status: 'proposed', requestId, options };
  } catch (error) {
    if (!recorded) {
      const errorCode = error instanceof EdgeError ? error.code : 'UNKNOWN';
      try {
        await finish({ status: 'failed', errorCode });
      } catch {
        console.error(JSON.stringify({ code: 'AI_REQUEST_FAILURE_UPDATE_FAILED' }));
      }
    }
    throw error;
  }
}

/**
 * "Vermont Friday to Saturday": keep only events on the Friday named, unless
 * that leaves nothing — the day may be misremembered, and a confirmation card
 * shows the real date either way.
 */
function narrowToCurrentDate(
  events: EditableEvent[],
  intent: EventEditIntent,
  timeZone: string,
  now: Date,
): EditableEvent[] {
  if (!intent.currentDate || intent.currentDate.type === 'unconstrained') {
    return events;
  }
  const window = resolveIntentDateWindow(intent.currentDate, timeZone, now);
  if (window.isImpossibleDate) return events;

  const from = startOfZonedDay(window.windowStart, timeZone).getTime();
  const to = window.windowEnd.getTime();
  const onThatDay = events.filter(
    (event) => new Date(event.startAt).getTime() < to && new Date(event.endAt).getTime() > from,
  );
  return onThatDay.length > 0 ? onThatDay : events;
}

/** A question the user can answer in the same bar. Returned, never logged. */
function questionFor(reason: EventMoveFailure, title: string): string {
  switch (reason) {
    case 'needs_single_day':
      return `Which day should “${title}” move to?`;
    case 'needs_exact_time':
      return `What time should “${title}” start?`;
    case 'all_day_has_no_time':
      return `“${title}” is an all-day event. Which day should it move to?`;
    case 'impossible_date':
      return 'That date doesn’t exist. Which day did you mean?';
    case 'in_past':
      return `That time has already passed. When should “${title}” move to?`;
    case 'unchanged':
      return `“${title}” is already then. Where should it move to?`;
    case 'no_change_requested':
      return `Where should “${title}” move to?`;
  }
}

function intentUpdate(result: AiEventEditIntentResult): AiRequestUpdate {
  const { metadata } = result;
  return {
    parsedIntent: result.intent,
    intentProvider: metadata.provider,
    intentModel: metadata.model,
    intentPromptVersion: metadata.promptVersion,
    intentLatencyMs: metadata.latencyMs,
    intentInputTokens: metadata.usage.inputTokens,
    intentOutputTokens: metadata.usage.outputTokens,
    intentReasoningTokens: metadata.usage.reasoningTokens,
    intentTotalTokens: metadata.usage.totalTokens,
  };
}
