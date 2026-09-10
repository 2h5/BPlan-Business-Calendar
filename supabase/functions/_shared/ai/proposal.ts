import {
  generateIntentReadback,
  resolveIntentDateWindow,
  resolveIntentDuration,
  resolveIntentTimeBounds,
} from '@cal/domain/scheduling';
import { getZonedParts } from '@cal/domain/time';
import type {
  AiFindTimeClarification,
  AiFindTimeReadback,
  AiScheduleRequest,
  ScheduleConstraints,
  SchedulingIntent,
} from '@cal/schemas/scheduling';

import { EdgeError } from '../errors/index.ts';
import {
  prepareDeterministicFindTime,
  type CandidateIdFactory,
  type DeterministicFindTimeResult,
  type FindTimeDataSource,
} from './find-time.ts';
import { type AiIntentProvider } from './intent.ts';
import {
  buildAiRankingInput,
  validateAiRankingProposal,
  type AiRankingProvider,
} from './ranking.ts';
import {
  type AiRequestSnapshot,
  type AiRequestTarget,
  type AiScheduleRepository,
  type AiSuggestionToPersist,
  type PersistedAiSuggestion,
} from './proposal-repository.ts';

export interface AiFindTimeProposal {
  status: 'proposed';
  requestId: string;
  task: {
    /** Null when the proposal is for an ad-hoc block rather than a task. */
    id: string | null;
    title: string;
    durationMinutes: number;
    deadlineAt: string | null;
    version: string | null;
  };
  targetCalendar: DeterministicFindTimeResult['targetCalendar'];
  constraints: ScheduleConstraints;
  suggestions: PersistedAiSuggestion[];
  readback?: AiFindTimeReadback;
  intent?: SchedulingIntent;
}

export type { AiFindTimeClarification };
export type AiFindTimeProposalResult = AiFindTimeProposal | AiFindTimeClarification;

export interface GenerateAiFindTimeProposalDeps {
  dataSource: FindTimeDataSource;
  repository: AiScheduleRepository;
  createProvider: () => AiRankingProvider;
  createIntentProvider?: () => AiIntentProvider;
  candidateIdFactory?: CandidateIdFactory;
  clock?: () => Date;
}

export async function generateAiFindTimeProposal(
  input: { userId: string; request: AiScheduleRequest; now?: Date },
  deps: GenerateAiFindTimeProposalDeps,
): Promise<AiFindTimeProposalResult> {
  const clockNow = (deps.clock ?? (() => new Date()))();

  // Natural language raw text branch: interpret scheduling intent via Luna
  if (input.request.text !== undefined) {
    return generateAiFindTimeProposalFromText(
      { userId: input.userId, text: input.request.text, request: input.request, now: clockNow },
      deps,
    );
  }

  const result = await prepareDeterministicFindTime(
    { ...input, allowNoValidSlot: true },
    deps.dataSource,
    deps.candidateIdFactory,
  );
  const snapshot = requestSnapshot(result);
  const completedAt = (deps.clock ?? (() => new Date()))().toISOString();

  const requestId = await deps.repository.claimRatedRequest(input.userId, findTimeTarget(result));
  if (requestId === null) {
    throw new EdgeError('AI_RATE_LIMITED', 'Find Time is limited to 10 attempts per hour.', 429);
  }

  let requestMarkedFailed = false;
  try {
    if (result.candidates.length === 0) {
      await deps.repository.updateRequest(input.userId, requestId, {
        status: 'failed',
        constraints: snapshot.constraints,
        targetCalendarId: snapshot.targetCalendarId,
        taskVersion: snapshot.taskVersion,
        profileVersion: snapshot.profileVersion,
        targetCalendarVersion: snapshot.targetCalendarVersion,
        candidateCount: snapshot.candidateCount,
        errorCode: 'AI_NO_VALID_SLOT',
        completedAt,
      });
      requestMarkedFailed = true;
      throw new EdgeError(
        'AI_NO_VALID_SLOT',
        'No open time fits this task before its deadline.',
        422,
      );
    }

    await deps.repository.updateRequest(input.userId, requestId, {
      status: 'pending',
      constraints: snapshot.constraints,
      targetCalendarId: snapshot.targetCalendarId,
      taskVersion: snapshot.taskVersion,
      profileVersion: snapshot.profileVersion,
      targetCalendarVersion: snapshot.targetCalendarVersion,
      candidateCount: snapshot.candidateCount,
    });

    const provider = deps.createProvider();
    const ranking = await provider.rankCandidateSlots(buildAiRankingInput(result));
    const proposal = validateAiRankingProposal(ranking.proposal, result.candidates);
    const candidatesById = new Map(result.candidates.map((candidate) => [candidate.id, candidate]));
    const rows = proposal.suggestions.map<AiSuggestionToPersist>((suggestion) => {
      const candidate = candidatesById.get(suggestion.slotId);
      if (!candidate) {
        throw new EdgeError('AI_INVALID_OUTPUT', 'The AI selected an unknown candidate.', 502);
      }
      return {
        slotId: suggestion.slotId,
        startAt: candidate.startAt,
        endAt: candidate.endAt,
        rank: suggestion.rank,
        score: suggestion.score,
        reason: suggestion.reason,
      };
    });
    const suggestions = await deps.repository.insertSuggestions(requestId, rows);

    await deps.repository.updateRequest(input.userId, requestId, {
      status: 'proposed',
      provider: ranking.metadata.provider,
      model: ranking.metadata.model,
      promptVersion: ranking.metadata.promptVersion,
      latencyMs: ranking.metadata.latencyMs,
      inputTokens: ranking.metadata.usage.inputTokens,
      outputTokens: ranking.metadata.usage.outputTokens,
      reasoningTokens: ranking.metadata.usage.reasoningTokens,
      totalTokens: ranking.metadata.usage.totalTokens,
      completedAt: (deps.clock ?? (() => new Date()))().toISOString(),
      errorCode: null,
    });

    return {
      status: 'proposed',
      requestId,
      task: {
        id: result.task.id,
        title: result.task.title,
        durationMinutes: result.task.durationMinutes,
        deadlineAt: result.task.deadlineAt,
        version: result.task.version,
      },
      targetCalendar: result.targetCalendar,
      constraints: result.constraints,
      suggestions,
    };
  } catch (error) {
    if (!requestMarkedFailed) {
      await markRequestFailed(deps.repository, input.userId, requestId, error, deps.clock);
    }
    throw error;
  }
}

/** The ad-hoc title and duration are persisted with the claimed request. */
function findTimeTarget(result: DeterministicFindTimeResult): AiRequestTarget {
  return result.task.id === null
    ? { taskId: null, title: result.task.title, durationMinutes: result.task.durationMinutes }
    : { taskId: result.task.id };
}

function requestSnapshot(result: DeterministicFindTimeResult): AiRequestSnapshot {
  return {
    taskId: result.task.id,
    targetCalendarId: result.targetCalendar.id,
    taskVersion: result.task.version,
    profileVersion: result.profileVersion,
    targetCalendarVersion: result.targetCalendar.updatedAt,
    constraints: result.constraints,
    candidateCount: result.candidates.length,
  };
}

async function markRequestFailed(
  repository: AiScheduleRepository,
  userId: string,
  requestId: string,
  error: unknown,
  clock: (() => Date) | undefined,
): Promise<void> {
  const errorCode = error instanceof EdgeError ? error.code : 'UNKNOWN';
  try {
    await repository.updateRequest(userId, requestId, {
      status: 'failed',
      errorCode,
      completedAt: (clock ?? (() => new Date()))().toISOString(),
    });
  } catch (updateError) {
    console.error(
      JSON.stringify({
        code: 'AI_REQUEST_FAILURE_UPDATE_FAILED',
        detail: updateError instanceof EdgeError ? updateError.code : 'UNKNOWN',
      }),
    );
  }
}

async function generateAiFindTimeProposalFromText(
  input: { userId: string; text: string; request: AiScheduleRequest; now: Date },
  deps: GenerateAiFindTimeProposalDeps,
): Promise<AiFindTimeProposalResult> {
  // Claim quota atomically with raw text BEFORE calling any billable model!
  const requestId = await deps.repository.claimRatedRequest(input.userId, {
    taskId: null,
    rawText: input.text,
  });
  if (requestId === null) {
    throw new EdgeError('AI_RATE_LIMITED', 'Find Time is limited to 10 attempts per hour.', 429);
  }

  let requestMarkedFailed = false;
  try {
    const profile = await deps.dataSource.loadProfile(input.userId);
    if (!profile) {
      throw new EdgeError('UNKNOWN', 'Could not load planning preferences.', 500);
    }

    if (!deps.createIntentProvider) {
      throw new EdgeError('AI_PROVIDER_UNAVAILABLE', 'Intent provider not configured.', 503);
    }

    const parts = getZonedParts(input.now, profile.timezone);
    const currentLocalDate = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const currentLocalTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;

    const intentProvider = deps.createIntentProvider();
    const intentResult = await intentProvider.parseSchedulingIntent({
      rawText: input.text,
      timezone: profile.timezone,
      currentLocalDate,
      currentLocalTime,
    });
    const parsedIntent = intentResult.intent;

    if (parsedIntent.requiresClarification) {
      await deps.repository.updateRequest(input.userId, requestId, {
        status: 'failed',
        errorCode: 'AI_CLARIFICATION_REQUIRED',
        provider: intentResult.metadata.provider,
        model: intentResult.metadata.model,
        promptVersion: intentResult.metadata.promptVersion,
        latencyMs: intentResult.metadata.latencyMs,
        inputTokens: intentResult.metadata.usage.inputTokens,
        outputTokens: intentResult.metadata.usage.outputTokens,
        reasoningTokens: intentResult.metadata.usage.reasoningTokens,
        totalTokens: intentResult.metadata.usage.totalTokens,
        parsedIntent,
        completedAt: (deps.clock ?? (() => new Date()))().toISOString(),
      });
      requestMarkedFailed = true;

      return {
        status: 'clarification_required',
        requestId,
        clarificationQuestion:
          parsedIntent.clarificationQuestion ??
          'Could you clarify what time or duration you prefer for this event?',
        intent: parsedIntent,
      };
    }

    const resolvedDuration = resolveIntentDuration(parsedIntent.duration);
    const resolvedWindow = resolveIntentDateWindow(parsedIntent.date, profile.timezone, input.now);
    const resolvedTimeBounds = resolveIntentTimeBounds(
      parsedIntent.time,
      resolvedDuration.durationMinutes,
    );
    const readback = generateIntentReadback(parsedIntent);

    const normalizedRequest: AiScheduleRequest = {
      title: parsedIntent.title,
      durationMinutes: resolvedDuration.durationMinutes,
      windowStart:
        parsedIntent.date.type === 'unconstrained'
          ? input.request.windowStart
          : resolvedWindow.windowStart.toISOString(),
      windowEnd:
        parsedIntent.date.type === 'unconstrained'
          ? input.request.windowEnd
          : resolvedWindow.windowEnd.toISOString(),
      bufferMinutes: input.request.bufferMinutes,
      earliestMinute: resolvedTimeBounds.earliestMinute ?? input.request.earliestMinute,
      latestMinute: resolvedTimeBounds.latestMinute ?? input.request.latestMinute,
      preferredTimeOfDay:
        resolvedTimeBounds.preferredTimeOfDay !== 'any'
          ? resolvedTimeBounds.preferredTimeOfDay
          : (input.request.preferredTimeOfDay ?? 'any'),
      note: resolvedTimeBounds.noteHint ?? input.request.note,
    };

    await deps.repository.updateRequest(input.userId, requestId, {
      status: 'pending',
      adHocTitle: parsedIntent.title,
      adHocDurationMinutes: resolvedDuration.durationMinutes,
      adHocLocation: parsedIntent.location,
      adHocDescription: parsedIntent.description,
      parsedIntent,
    });

    const result = await prepareDeterministicFindTime(
      {
        userId: input.userId,
        request: normalizedRequest,
        now: input.now,
        allowNoValidSlot: true,
        allowedDurationsMinutes: resolvedDuration.allowedDurationsMinutes,
      },
      deps.dataSource,
      deps.candidateIdFactory,
    );

    const snapshot = requestSnapshot(result);
    const completedAt = (deps.clock ?? (() => new Date()))().toISOString();

    if (result.candidates.length === 0) {
      await deps.repository.updateRequest(input.userId, requestId, {
        status: 'failed',
        constraints: snapshot.constraints,
        targetCalendarId: snapshot.targetCalendarId,
        taskVersion: snapshot.taskVersion,
        profileVersion: snapshot.profileVersion,
        targetCalendarVersion: snapshot.targetCalendarVersion,
        candidateCount: 0,
        errorCode: 'AI_NO_VALID_SLOT',
        completedAt,
      });
      requestMarkedFailed = true;
      throw new EdgeError(
        'AI_NO_VALID_SLOT',
        'No open time fits this task before its deadline.',
        422,
      );
    }

    await deps.repository.updateRequest(input.userId, requestId, {
      status: 'pending',
      constraints: snapshot.constraints,
      targetCalendarId: snapshot.targetCalendarId,
      taskVersion: snapshot.taskVersion,
      profileVersion: snapshot.profileVersion,
      targetCalendarVersion: snapshot.targetCalendarVersion,
      candidateCount: snapshot.candidateCount,
    });

    const provider = deps.createProvider();
    const ranking = await provider.rankCandidateSlots(buildAiRankingInput(result));
    const proposal = validateAiRankingProposal(ranking.proposal, result.candidates);
    const candidatesById = new Map(result.candidates.map((candidate) => [candidate.id, candidate]));
    const rows = proposal.suggestions.map<AiSuggestionToPersist>((suggestion) => {
      const candidate = candidatesById.get(suggestion.slotId);
      if (!candidate) {
        throw new EdgeError('AI_INVALID_OUTPUT', 'The AI selected an unknown candidate.', 502);
      }
      return {
        slotId: suggestion.slotId,
        startAt: candidate.startAt,
        endAt: candidate.endAt,
        rank: suggestion.rank,
        score: suggestion.score,
        reason: suggestion.reason,
      };
    });
    const suggestions = await deps.repository.insertSuggestions(requestId, rows);

    await deps.repository.updateRequest(input.userId, requestId, {
      status: 'proposed',
      provider: ranking.metadata.provider,
      model: ranking.metadata.model,
      promptVersion: ranking.metadata.promptVersion,
      latencyMs: ranking.metadata.latencyMs,
      inputTokens: ranking.metadata.usage.inputTokens,
      outputTokens: ranking.metadata.usage.outputTokens,
      reasoningTokens: ranking.metadata.usage.reasoningTokens,
      totalTokens: ranking.metadata.usage.totalTokens,
      completedAt: (deps.clock ?? (() => new Date()))().toISOString(),
      errorCode: null,
    });

    return {
      status: 'proposed',
      requestId,
      task: {
        id: result.task.id,
        title: result.task.title,
        durationMinutes: result.task.durationMinutes,
        deadlineAt: result.task.deadlineAt,
        version: result.task.version,
      },
      targetCalendar: result.targetCalendar,
      constraints: result.constraints,
      suggestions,
      readback,
      intent: parsedIntent,
    };
  } catch (error) {
    if (!requestMarkedFailed) {
      await markRequestFailed(deps.repository, input.userId, requestId, error, deps.clock);
    }
    throw error;
  }
}
