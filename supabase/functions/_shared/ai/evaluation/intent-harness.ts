import { schedulingIntentSchema, type SchedulingIntent } from '@cal/schemas/scheduling';

import { EdgeError, type EdgeErrorCode } from '../../errors/index.ts';
import type { AiIntentProvider, AiIntentResult } from '../intent.ts';
import {
  AI_INTENT_EVALUATION_FIXTURES,
  type AiIntentEvaluationFixture,
  type ExpectedIntent,
} from './intent-fixtures.ts';
import { AI_EVALUATION_PRICE_SNAPSHOT } from './harness.ts';

export interface AiIntentEvaluationGrade {
  completed: boolean;
  schemaValid: boolean;
  accuracyPassed: boolean;
  clarificationPassed: boolean;
  passed: boolean;
}

export interface AiIntentEvaluationRecord {
  fixtureId: string;
  model: string;
  repetition: number;
  providerCalled: boolean;
  promptVersion: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  estimatedCostUsd: number | null;
  errorCode: EdgeErrorCode | null;
  grade: AiIntentEvaluationGrade;
  parsedIntent: SchedulingIntent | null;
}

export interface AiIntentEvaluationSummary {
  model: string;
  attemptedRuns: number;
  completedRuns: number;
  schemaValidRate: number;
  accuracyRate: number;
  clarificationPassRate: number;
  averageLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalReasoningTokens: number;
  estimatedCostUsd: number;
}

export interface RunAiIntentEvaluationOptions {
  models: readonly string[];
  repetitions: number;
  createProvider(model: string): AiIntentProvider;
  fixtures?: readonly AiIntentEvaluationFixture[];
}

export async function runAiIntentEvaluation(
  options: RunAiIntentEvaluationOptions,
): Promise<{ records: AiIntentEvaluationRecord[]; summaries: AiIntentEvaluationSummary[] }> {
  const fixtures = options.fixtures ?? AI_INTENT_EVALUATION_FIXTURES;
  const records: AiIntentEvaluationRecord[] = [];

  for (const model of options.models) {
    const provider = options.createProvider(model);
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      for (const fixture of fixtures) {
        records.push(await evaluateIntentFixture(provider, model, repetition, fixture));
      }
    }
  }

  return {
    records,
    summaries: options.models.map((model) => summarizeIntentModel(model, records)),
  };
}

async function evaluateIntentFixture(
  provider: AiIntentProvider,
  model: string,
  repetition: number,
  fixture: AiIntentEvaluationFixture,
): Promise<AiIntentEvaluationRecord> {
  try {
    const result = await provider.parseSchedulingIntent(fixture.input);
    const grade = gradeIntentFixture(fixture, result);

    const cost = estimateCost(
      model,
      result.metadata.usage.inputTokens ?? 0,
      result.metadata.usage.outputTokens ?? 0,
    );

    return {
      fixtureId: fixture.id,
      model,
      repetition,
      providerCalled: true,
      promptVersion: result.metadata.promptVersion,
      latencyMs: result.metadata.latencyMs,
      inputTokens: result.metadata.usage.inputTokens,
      outputTokens: result.metadata.usage.outputTokens,
      reasoningTokens: result.metadata.usage.reasoningTokens,
      estimatedCostUsd: cost,
      errorCode: null,
      grade,
      parsedIntent: result.intent,
    };
  } catch (error) {
    const errorCode = error instanceof EdgeError ? error.code : 'UNKNOWN';
    return {
      fixtureId: fixture.id,
      model,
      repetition,
      providerCalled: true,
      promptVersion: null,
      latencyMs: null,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      estimatedCostUsd: null,
      errorCode,
      grade: {
        completed: false,
        schemaValid: false,
        accuracyPassed: false,
        clarificationPassed: false,
        passed: false,
      },
      parsedIntent: null,
    };
  }
}

function gradeIntentFixture(
  fixture: AiIntentEvaluationFixture,
  result: AiIntentResult,
): AiIntentEvaluationGrade {
  const schemaValid = schedulingIntentSchema.safeParse(result.intent).success;
  const expected = fixture.expected;
  const actual = result.intent;

  const clarificationPassed =
    actual.requiresClarification === expected.requiresClarification &&
    (!expected.clarificationQuestionContains ||
      (actual.clarificationQuestion !== null &&
        actual.clarificationQuestion.includes(expected.clarificationQuestionContains)));

  let accuracyPassed = true;

  if (!expected.requiresClarification) {
    if (
      expected.titleContains &&
      !actual.title.toLowerCase().includes(expected.titleContains.toLowerCase())
    ) {
      accuracyPassed = false;
    }

    if (expected.duration !== undefined) {
      if (expected.duration === null) {
        if (actual.duration !== null) {
          accuracyPassed = false;
        }
      } else if (!actual.duration) {
        accuracyPassed = false;
      } else if (expected.duration.type === 'range') {
        if (
          actual.duration.type !== 'range' ||
          actual.duration.minMinutes !== expected.duration.minMinutes ||
          actual.duration.maxMinutes !== expected.duration.maxMinutes
        ) {
          accuracyPassed = false;
        }
      } else if (
        actual.duration.type !== expected.duration.type ||
        actual.duration.minutes !== expected.duration.minutes
      ) {
        accuracyPassed = false;
      }
    }

    if (expected.dateType && actual.date.type !== expected.dateType) {
      accuracyPassed = false;
    }

    if (expected.dateWeekday !== undefined) {
      if (actual.date.type !== 'weekday' || actual.date.weekday !== expected.dateWeekday) {
        accuracyPassed = false;
      }
    }

    if (expected.dateModifier !== undefined) {
      const dateWithModifier =
        actual.date.type === 'weekday' ||
        actual.date.type === 'weekend' ||
        actual.date.type === 'relative_week'
          ? actual.date
          : null;
      if (!dateWithModifier || dateWithModifier.modifier !== expected.dateModifier) {
        accuracyPassed = false;
      }
    }

    if (expected.datePreference !== undefined) {
      const dateWithPreference =
        actual.date.type === 'weekend' || actual.date.type === 'relative_week' ? actual.date : null;
      if (!dateWithPreference || dateWithPreference.preference !== expected.datePreference) {
        accuracyPassed = false;
      }
    }

    if (expected.timeType && actual.time.type !== expected.timeType) {
      accuracyPassed = false;
    }

    if (expected.timeHour !== undefined || expected.timeMinute !== undefined) {
      const timeWithClock =
        actual.time.type === 'exact_time' ||
        actual.time.type === 'around_time' ||
        actual.time.type === 'after_time' ||
        actual.time.type === 'before_time'
          ? actual.time
          : null;
      if (
        !timeWithClock ||
        (expected.timeHour !== undefined && timeWithClock.hour !== expected.timeHour) ||
        (expected.timeMinute !== undefined && timeWithClock.minute !== expected.timeMinute)
      ) {
        accuracyPassed = false;
      }
    }

    if (expected.timeStartHour !== undefined || expected.timeStartMinute !== undefined) {
      if (
        actual.time.type !== 'between_times' ||
        (expected.timeStartHour !== undefined &&
          actual.time.startHour !== expected.timeStartHour) ||
        (expected.timeStartMinute !== undefined &&
          actual.time.startMinute !== expected.timeStartMinute)
      ) {
        accuracyPassed = false;
      }
    }

    if (expected.timeEndHour !== undefined || expected.timeEndMinute !== undefined) {
      if (
        actual.time.type !== 'between_times' ||
        (expected.timeEndHour !== undefined && actual.time.endHour !== expected.timeEndHour) ||
        (expected.timeEndMinute !== undefined && actual.time.endMinute !== expected.timeEndMinute)
      ) {
        accuracyPassed = false;
      }
    }

    if (expected.timePreference !== undefined) {
      if (
        actual.time.type !== 'time_of_day' ||
        actual.time.preference !== expected.timePreference
      ) {
        accuracyPassed = false;
      }
    }

    if (
      expected.locationContains &&
      (!actual.location ||
        !actual.location.toLowerCase().includes(expected.locationContains.toLowerCase()))
    ) {
      accuracyPassed = false;
    }

    if (
      expected.descriptionContains !== undefined &&
      (!actual.description ||
        !actual.description.toLowerCase().includes(expected.descriptionContains.toLowerCase()))
    ) {
      accuracyPassed = false;
    }
  }

  const passed = schemaValid && clarificationPassed && accuracyPassed;

  return {
    completed: true,
    schemaValid,
    accuracyPassed,
    clarificationPassed,
    passed,
  };
}

function summarizeIntentModel(
  model: string,
  records: readonly AiIntentEvaluationRecord[],
): AiIntentEvaluationSummary {
  const modelRecords = records.filter((r) => r.model === model);
  const attempted = modelRecords.length;
  const completed = modelRecords.filter((r) => r.grade.completed).length;

  const validCount = modelRecords.filter((r) => r.grade.schemaValid).length;
  const accuracyCount = modelRecords.filter((r) => r.grade.accuracyPassed).length;
  const clarCount = modelRecords.filter((r) => r.grade.clarificationPassed).length;

  const latencies = modelRecords
    .map((r) => r.latencyMs)
    .filter((l): l is number => typeof l === 'number');
  const avgLatency =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

  const totalInputTokens = modelRecords.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
  const totalOutputTokens = modelRecords.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0);
  const totalReasoningTokens = modelRecords.reduce((sum, r) => sum + (r.reasoningTokens ?? 0), 0);
  const totalCost = modelRecords.reduce((sum, r) => sum + (r.estimatedCostUsd ?? 0), 0);

  return {
    model,
    attemptedRuns: attempted,
    completedRuns: completed,
    schemaValidRate: attempted > 0 ? validCount / attempted : 0,
    accuracyRate: attempted > 0 ? accuracyCount / attempted : 0,
    clarificationPassRate: attempted > 0 ? clarCount / attempted : 0,
    averageLatencyMs: avgLatency,
    totalInputTokens,
    totalOutputTokens,
    totalReasoningTokens,
    estimatedCostUsd: totalCost,
  };
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices =
    (
      AI_EVALUATION_PRICE_SNAPSHOT.perMillionTokensUsd as Record<
        string,
        { input: number; output: number }
      >
    )[model] ?? AI_EVALUATION_PRICE_SNAPSHOT.perMillionTokensUsd['gpt-5.6-luna'];

  const inputCost = (inputTokens / 1_000_000) * prices.input;
  const outputCost = (outputTokens / 1_000_000) * prices.output;
  return Number((inputCost + outputCost).toFixed(6));
}
