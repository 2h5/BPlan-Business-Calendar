import { createOpenAiIntentProvider, openAiIntentConfigFromEnv } from '../openai-intent.ts';
import {
  AI_EVALUATION_LUNA_VARIANTS,
  AI_EVALUATION_PRICE_SNAPSHOT,
  findEvaluationVariant,
} from './harness.ts';
import { runAiIntentEvaluation } from './intent-harness.ts';

if (import.meta.main) {
  if (Deno.env.get('RUN_LIVE_AI_EVAL') !== 'true') {
    throw new Error('Set RUN_LIVE_AI_EVAL=true to acknowledge live API usage and cost.');
  }

  const baseConfig = openAiIntentConfigFromEnv();

  // Evaluates Luna Low (default) vs Luna Medium. The model family is fixed, so
  // model and reasoning-effort environment overrides are ignored per variant.
  const result = await runAiIntentEvaluation({
    models: AI_EVALUATION_LUNA_VARIANTS.map((variant) => variant.label),
    repetitions: 3,
    createProvider: (label) => {
      const variant = findEvaluationVariant(label);
      return createOpenAiIntentProvider({
        ...baseConfig,
        model: variant.model,
        reasoningEffort: variant.reasoningEffort,
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
