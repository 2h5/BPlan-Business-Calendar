import { scheduleConstraintsSchema, type AiScheduleRequest } from '@cal/schemas/scheduling';

import { EdgeError, type EdgeErrorCode } from '../errors/index.ts';
import { prepareDeterministicFindTime, type FindTimeDataSource } from './find-time.ts';
import {
  type AiConfirmationRepository,
  type ConfirmedSchedule,
  type PersistedAiConfirmation,
} from './confirmation-repository.ts';

const STALE_PREPARATION_CODES = new Set<EdgeErrorCode>([
  'NOT_FOUND',
  'AI_TASK_NOT_SCHEDULABLE',
  'AI_TASK_DURATION_REQUIRED',
  'AI_SCHEDULING_WINDOW_INVALID',
  'AI_DEFAULT_CALENDAR_MISSING',
  'AI_NO_VALID_SLOT',
]);

export interface ConfirmAiScheduleDeps {
  dataSource: FindTimeDataSource;
  repository: AiConfirmationRepository;
  now?: () => Date;
}

export interface ConfirmedAiSchedule extends ConfirmedSchedule {
  status: 'accepted';
  requestId: string;
  suggestionId: string;
}

/**
 * Confirm one persisted suggestion. Availability is re-derived here from
 * current server state; the database operation repeats the critical checks in
 * its transaction before making any event/task/AI-state writes.
 */
export async function confirmAiScheduleSuggestion(
  input: { userId: string; suggestionId: string },
  deps: ConfirmAiScheduleDeps,
): Promise<ConfirmedAiSchedule> {
  const persisted = await deps.repository.loadSuggestion(input.userId, input.suggestionId);
  if (!persisted) throw new EdgeError('NOT_FOUND', 'That suggestion was not found.', 404);

  if (persisted.requestStatus === 'accepted') {
    if (persisted.acceptedAt === null || persisted.acceptedEventId === null) {
      throw staleProposal();
    }
    return finishAccepted(input, persisted, deps.repository);
  }

  if (
    persisted.requestStatus !== 'proposed' ||
    persisted.acceptedAt !== null ||
    persisted.acceptedEventId !== null
  ) {
    throw staleProposal();
  }

  const constraints = parsePersistedConstraints(persisted);
  const current = await revalidateCurrentSlot(input.userId, persisted, constraints, deps);
  if (!sameTaskVersion(persisted, current.task.version)) throw staleProposal();
  if (!sameInstant(current.profileVersion, persisted.profileVersion)) throw staleProposal();
  if (
    current.targetCalendar.id !== persisted.targetCalendarId ||
    !sameInstant(current.targetCalendar.updatedAt, persisted.targetCalendarVersion) ||
    current.targetCalendar.sourceType !== 'internal' ||
    !current.targetCalendar.isDefault ||
    current.targetCalendar.isReadOnly
  ) {
    throw staleProposal();
  }

  const exactSlotStillExists = current.candidates.some(
    (candidate) =>
      sameInstant(candidate.startAt, persisted.startAt) &&
      sameInstant(candidate.endAt, persisted.endAt),
  );
  if (!exactSlotStillExists) throw staleProposal();

  const attempt = await deps.repository.confirmSuggestion(input.userId, input.suggestionId);
  return finishAttempt(input, persisted, attempt.status, attempt.eventId, deps.repository);
}

function parsePersistedConstraints(persisted: PersistedAiConfirmation) {
  const parsed = scheduleConstraintsSchema.safeParse(persisted.constraints);
  if (!parsed.success) throw staleProposal();
  return parsed.data;
}

async function revalidateCurrentSlot(
  userId: string,
  persisted: PersistedAiConfirmation,
  constraints: ReturnType<typeof scheduleConstraintsSchema.parse>,
  deps: ConfirmAiScheduleDeps,
) {
  try {
    return await prepareDeterministicFindTime(
      {
        userId,
        request: requestFromPersistedConstraints(persisted, constraints),
        now: (deps.now ?? (() => new Date()))(),
        allowedDurationsMinutes: constraints.allowedDurationsMinutes,
      },
      deps.dataSource,
    );
  } catch (error) {
    if (error instanceof EdgeError && STALE_PREPARATION_CODES.has(error.code)) {
      throw staleProposal();
    }
    throw error;
  }
}

function requestFromPersistedConstraints(
  persisted: PersistedAiConfirmation,
  constraints: ReturnType<typeof scheduleConstraintsSchema.parse>,
): AiScheduleRequest {
  // An ad-hoc block is revalidated from its own persisted title and duration;
  // there is no task row to re-read them from.
  const target =
    persisted.taskId === null
      ? { title: requireAdHocTitle(persisted), durationMinutes: constraints.durationMinutes }
      : { taskId: persisted.taskId };

  return {
    ...target,
    windowStart: constraints.windowStart,
    windowEnd: constraints.windowEnd,
    bufferMinutes: constraints.bufferMinutes,
    earliestMinute: constraints.earliestMinute,
    latestMinute: constraints.latestMinute,
    exactStartMinute: constraints.exactStartMinute,
    preferredTimeOfDay: constraints.preferredTimeOfDay,
  };
}

async function finishAttempt(
  input: { userId: string; suggestionId: string },
  persisted: PersistedAiConfirmation,
  status: 'accepted' | 'stale' | 'not_found',
  eventId: string | null,
  repository: AiConfirmationRepository,
): Promise<ConfirmedAiSchedule> {
  if (status === 'not_found') {
    throw new EdgeError('NOT_FOUND', 'That suggestion was not found.', 404);
  }
  if (status === 'stale' || eventId === null) throw staleProposal();
  return finishAccepted(input, { ...persisted, acceptedEventId: eventId }, repository);
}

async function finishAccepted(
  input: { userId: string; suggestionId: string },
  persisted: PersistedAiConfirmation,
  repository: AiConfirmationRepository,
): Promise<ConfirmedAiSchedule> {
  if (persisted.acceptedEventId === null) throw staleProposal();
  const canonical = await repository.loadCanonicalSchedule(
    input.userId,
    persisted.acceptedEventId,
    persisted.taskId,
  );
  if (!canonical) {
    throw staleProposal();
  }
  return {
    status: 'accepted',
    requestId: persisted.requestId,
    suggestionId: input.suggestionId,
    ...canonical,
  };
}

function requireAdHocTitle(persisted: PersistedAiConfirmation): string {
  const title = persisted.adHocTitle?.trim();
  if (!title) throw staleProposal();
  return title;
}

/**
 * A task-backed proposal must still match the task row it was built from. An
 * ad-hoc proposal versions no task, so both sides must be absent instead.
 */
function sameTaskVersion(persisted: PersistedAiConfirmation, current: string | null): boolean {
  if (persisted.taskId === null) return persisted.taskVersion === null && current === null;
  return sameInstant(current, persisted.taskVersion);
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && leftMs === rightMs;
}

function staleProposal(): EdgeError {
  return new EdgeError(
    'AI_PROPOSAL_STALE',
    'That scheduling suggestion is no longer current. Find Time again for a fresh proposal.',
    409,
  );
}
