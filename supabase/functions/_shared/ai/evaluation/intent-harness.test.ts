import { assertEquals } from 'jsr:@std/assert@^1.0.0';

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
