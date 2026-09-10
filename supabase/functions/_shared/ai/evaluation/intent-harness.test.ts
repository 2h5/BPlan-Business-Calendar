import { assertEquals } from 'jsr:@std/assert@^1.0.0';
import type { SchedulingIntent } from '@cal/schemas/scheduling';

import { runAiIntentEvaluation } from './intent-harness.ts';
import type { AiIntentEvaluationFixture } from './intent-fixtures.ts';
import type { AiIntentProvider } from '../intent.ts';

const TEST_FIXTURES: readonly AiIntentEvaluationFixture[] = [
  {
    id: 'test-lasting',
    description: 'Clean title stripping trailing preposition',
    input: {
      rawText: 'meeting with Andrew lasting 15m',
      timezone: 'America/New_York',
      currentLocalDate: '2026-09-08',
      currentLocalTime: '10:00',
    },
    expected: {
      titleContains: 'meeting with Andrew',
      duration: { type: 'exact', minutes: 15 },
      dateType: 'unconstrained',
      timeType: 'unconstrained',
      requiresClarification: false,
    },
  },
  {
    id: 'test-clarification',
    description: 'Ambiguous text requires clarification',
    input: {
      rawText: 'schedule something',
      timezone: 'America/New_York',
      currentLocalDate: '2026-09-08',
      currentLocalTime: '10:00',
    },
    expected: {
      requiresClarification: true,
      clarificationQuestionContains: '?',
    },
  },
];

Deno.test('evaluates intent fixtures and computes summaries across models', async () => {
  const providerFor = (model: string): AiIntentProvider => ({
    provider: 'fixture',
    model,
    parseSchedulingIntent: (input) => {
      const isClarification = input.rawText.includes('something');
      return Promise.resolve({
        intent: isClarification
          ? {
              title: 'something',
              duration: null,
              date: { type: 'unconstrained' as const },
              time: { type: 'unconstrained' as const },
              location: null,
              description: null,
              requiresClarification: true,
              clarificationQuestion: 'What time would you prefer?',
            }
          : {
              title: 'meeting with Andrew',
              duration: { type: 'exact' as const, minutes: 15 },
              date: { type: 'unconstrained' as const },
              time: { type: 'unconstrained' as const },
              location: null,
              description: null,
              requiresClarification: false,
              clarificationQuestion: null,
            },
        metadata: {
          provider: 'fixture',
          model,
          responseId: 'resp_test',
          promptVersion: 'find-time-intent-v1',
          latencyMs: 40,
          usage: { inputTokens: 100, outputTokens: 30, reasoningTokens: 5, totalTokens: 135 },
        },
      });
    },
  });

  const { records, summaries } = await runAiIntentEvaluation({
    models: ['gpt-5.6-luna'],
    repetitions: 2,
    fixtures: TEST_FIXTURES,
    createProvider: (model) => providerFor(model),
  });

  assertEquals(records.length, 4); // 2 fixtures * 2 repetitions
  assertEquals(summaries.length, 1);

  const summary = summaries[0];
  if (!summary) throw new Error('Expected summary');

  assertEquals(summary.model, 'gpt-5.6-luna');
  assertEquals(summary.attemptedRuns, 4);
  assertEquals(summary.completedRuns, 4);
  assertEquals(summary.schemaValidRate, 1.0);
  assertEquals(summary.accuracyRate, 1.0);
  assertEquals(summary.clarificationPassRate, 1.0);
  assertEquals(summary.averageLatencyMs, 40);
  assertEquals(summary.totalInputTokens, 400);
  assertEquals(summary.totalOutputTokens, 120);
});

Deno.test(
  'grades supplied detail expectations instead of allowing omitted fields to pass',
  async () => {
    const expected = {
      titleContains: 'planning session',
      duration: null,
      dateType: 'relative_week' as const,
      dateModifier: 'next' as const,
      datePreference: 'late' as const,
      timeType: 'exact_time' as const,
      timeHour: 15,
      timeMinute: 0,
      descriptionContains: 'roadmap',
      requiresClarification: false,
    };
    const matchingIntent: SchedulingIntent = {
      title: 'Planning session',
      duration: null,
      date: { type: 'relative_week', modifier: 'next', preference: 'late' },
      time: { type: 'exact_time', hour: 15, minute: 0 },
      location: null,
      description: 'Discuss the roadmap',
      requiresClarification: false,
      clarificationQuestion: null,
    };
    const omittedIntent: SchedulingIntent = {
      title: 'Planning session',
      duration: null,
      date: { type: 'unconstrained' },
      time: { type: 'unconstrained' },
      location: null,
      description: null,
      requiresClarification: false,
      clarificationQuestion: null,
    };
    const fixtures: readonly AiIntentEvaluationFixture[] = [
      {
        id: 'strict-match',
        description: 'All supplied detail expectations match.',
        input: {
          rawText: 'matching intent',
          timezone: 'America/New_York',
          currentLocalDate: '2026-09-08',
          currentLocalTime: '10:00',
        },
        expected,
      },
      {
        id: 'strict-omitted',
        description: 'Omitted detail expectations must fail grading.',
        input: {
          rawText: 'omitted intent',
          timezone: 'America/New_York',
          currentLocalDate: '2026-09-08',
          currentLocalTime: '10:00',
        },
        expected,
      },
    ];

    const { records } = await runAiIntentEvaluation({
      models: ['fixture-model'],
      repetitions: 1,
      fixtures,
      createProvider: (model) => ({
        provider: 'fixture',
        model,
        parseSchedulingIntent: (input) =>
          Promise.resolve({
            intent: input.rawText === 'matching intent' ? matchingIntent : omittedIntent,
            metadata: {
              provider: 'fixture',
              model,
              responseId: 'resp_strict_test',
              promptVersion: 'find-time-intent-v1',
              latencyMs: 1,
              usage: { inputTokens: 1, outputTokens: 1, reasoningTokens: 0, totalTokens: 2 },
            },
          }),
      }),
    });

    const matching = records.find((record) => record.fixtureId === 'strict-match');
    const omitted = records.find((record) => record.fixtureId === 'strict-omitted');
    if (!matching || !omitted) throw new Error('Expected strict grading records.');

    assertEquals(matching.grade.passed, true);
    assertEquals(omitted.grade.accuracyPassed, false);
    assertEquals(omitted.grade.passed, false);
  },
);
