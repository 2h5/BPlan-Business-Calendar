import { createOpenAiIntentProvider, openAiIntentConfigFromEnv } from '../openai-intent.ts';
import { AI_EVALUATION_PRICE_SNAPSHOT } from './harness.ts';
import { runAiIntentEvaluation } from './intent-harness.ts';

if (import.meta.main) {
  if (Deno.env.get('RUN_LIVE_AI_EVAL') !== 'true') {
    throw new Error('Set RUN_LIVE_AI_EVAL=true to acknowledge live API usage and cost.');
  }

  const baseConfig = openAiIntentConfigFromEnv();

  // Evaluates Luna Low (default) vs Luna Medium
  const result = await runAiIntentEvaluation({
    models: ['gpt-5.6-luna-low', 'gpt-5.6-luna-medium'],
    repetitions: 3,
    createProvider: (variant) => {
      const isMedium = variant.endsWith('-medium');
      return createOpenAiIntentProvider({
        ...baseConfig,
        model: 'gpt-5.6-luna',
        reasoningEffort: isMedium ? 'medium' : 'low',
      });
    },
  });

  console.log(
    JSON.stringify(
      {
        priceSnapshot: AI_EVALUATION_PRICE_SNAPSHOT,
        summaries: result.summaries,
        failures: result.records
          .filter((record) => !record.grade.passed)
          .map((record) => ({
            fixtureId: record.fixtureId,
            model: record.model,
            repetition: record.repetition,
            errorCode: record.errorCode,
            grade: record.grade,
          })),
      },
      null,
      2,
    ),
  );
}
